from flask import Flask, request, jsonify, session, send_from_directory, render_template
from PIL import Image
import uuid
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
import sqlite3
import os
import smtplib
import mimetypes
from email.mime.text import MIMEText

# Force Render/Gunicorn to explicitly recognize frontend web languages
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')

app = Flask(__name__, static_folder='static', template_folder='static')
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.secret_key = os.environ.get('SECRET_KEY', 'super-secret-dealership-key')
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    MAX_CONTENT_LENGTH=16 * 1024 * 1024
)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'}


def compress_image(file_obj):
    img = Image.open(file_obj.stream)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    base_width = 1200
    if img.width > base_width:
        wpercent = (base_width / float(img.width))
        hsize = int((float(img.height) * float(wpercent)))
        img = img.resize((base_width, hsize), Image.Resampling.LANCZOS)
    safe_filename = str(uuid.uuid4()) + '.webp'
    os.makedirs(os.path.join('static', 'uploads'), exist_ok=True)
    upload_path = os.path.join('static', 'uploads', safe_filename)
    img.save(upload_path, 'webp', optimize=True, quality=80)
    return safe_filename

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

DB_FILE = 'database.sqlite'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS vehicles
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  make TEXT, model TEXT, year TEXT, price TEXT, 
                  mileage TEXT, transmission TEXT, engine TEXT, img_url TEXT, tags TEXT)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS enquiries
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT, phone TEXT, email TEXT, vehicle TEXT, message TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')

    try:
        c.execute("ALTER TABLE enquiries ADD COLUMN marketing_opt_in BOOLEAN DEFAULT 0")
    except sqlite3.OperationalError:
        pass # Column already exists
        
    try:
        c.execute("ALTER TABLE vehicles ADD COLUMN features TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE vehicles ADD COLUMN auction_grade TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE vehicles ADD COLUMN body_type TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE vehicles ADD COLUMN additional_images TEXT")
    except sqlite3.OperationalError:
        pass

    try:
        c.execute("ALTER TABLE vehicles ADD COLUMN description TEXT")
    except sqlite3.OperationalError:
        pass
    
    # Insert initial dummy data if empty
    c.execute("SELECT COUNT(*) FROM vehicles")
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO vehicles (make, model, year, price, mileage, transmission, engine, img_url, tags) VALUES (?,?,?,?,?,?,?,?,?)", 
                  ("Toyota", "Alphard Executive Lounge", "2016", "£21,495", "32,000", "Automatic", "2.5L Hybrid", "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fd?q=80&w=2696&auto=format&fit=crop", "⏰ 1 Viewing Booked"))
        c.execute("INSERT INTO vehicles (make, model, year, price, mileage, transmission, engine, img_url, tags) VALUES (?,?,?,?,?,?,?,?,?)", 
                  ("Nissan", "Elgrand Highway Star", "2014", "£12,995", "41,000", "Automatic", "3.5L Petrol", "https://images.unsplash.com/photo-1629897034960-9dc47b0a72ad?q=80&w=2670&auto=format&fit=crop", "🔥 Highly Requested"))
    conn.commit()
    conn.close()

init_db()

@app.after_request
def add_security_headers(response):
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Server'] = 'Dealership-Platform/1.0'
    return response

# --- Serve Static Content ---
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join('static', path)):
        return send_from_directory('static', path)
    return send_from_directory('static', 'index.html')

# --- Public API Endpoints ---
@app.route('/api/vehicles', methods=['GET'])
def get_vehicles():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM vehicles")
    cars = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(cars)

@app.route('/api/vehicles/<int:id>', methods=['GET'])
def get_vehicle(id):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM vehicles WHERE id=?", (id,))
    row = c.fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({"error": "Vehicle not found"}), 404

# --- Private Admin Endpoints ---
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    password = data.get('password')
    if password == os.environ.get('ADMIN_PASS', 'owner123'):
        session['admin_logged_in'] = True
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Invalid password"}), 401

@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    session.pop('admin_logged_in', None)
    return jsonify({"success": True})

@app.route('/api/admin/status', methods=['GET'])
def admin_status():
    if session.get('admin_logged_in'):
        return jsonify({"logged_in": True})
    return jsonify({"logged_in": False})

@app.route('/api/admin/vehicles', methods=['POST'])
def add_vehicle():
    if not session.get('admin_logged_in'):
        return jsonify({"error": "Unauthorized"}), 401
    
    files = request.files.getlist('img_upload')
    img_url = ""
    additional_images = []
    
    for idx, file in enumerate(files):
        if file and file.filename and allowed_file(file.filename):
            new_filename = compress_image(file)
            upload_path = os.path.join('static', 'uploads', new_filename)
            
            if idx == 0:
                img_url = f"/{upload_path}"
            else:
                additional_images.append(f"/{upload_path}")

    if not img_url:
        img_url = request.form.get('img_url', '')

    additional_images_str = ",".join(additional_images)

    data = request.form
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT INTO vehicles (make, model, year, price, mileage, transmission, engine, img_url, tags, features, auction_grade, body_type, additional_images, description, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              (data.get('make'), data.get('model'), data.get('year'), data.get('price'), data.get('mileage'), data.get('transmission'), data.get('engine'), img_url, data.get('tags'), data.get('features'), data.get('auction_grade'), data.get('body_type', 'JDM Import'), additional_images_str, data.get('description', ''), data.get('status', 'Available')))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/admin/vehicles/<int:id>', methods=['PUT', 'POST'])
def edit_vehicle(id):
    if not session.get('admin_logged_in'):
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.form
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    files = request.files.getlist('img_upload')
    img_url = ""
    additional_images = []
    
    has_files = False
    for idx, file in enumerate(files):
        if file and file.filename and allowed_file(file.filename):
            has_files = True
            new_filename = compress_image(file)
            upload_path = os.path.join('static', 'uploads', new_filename)
            
            if idx == 0:
                img_url = f"/{upload_path}"
            else:
                additional_images.append(f"/{upload_path}")
                
    additional_images_str = ",".join(additional_images)
    
    if has_files:
        c.execute("""UPDATE vehicles SET make=?, model=?, year=?, price=?, mileage=?, transmission=?, engine=?, tags=?, features=?, auction_grade=?, body_type=?, img_url=?, additional_images=?, description=?, status=? WHERE id=?""",
                  (data.get('make'), data.get('model'), data.get('year'), data.get('price'), data.get('mileage'), data.get('transmission'), data.get('engine'), data.get('tags'), data.get('features'), data.get('auction_grade'), data.get('body_type', 'JDM Import'), img_url, additional_images_str, data.get('description', ''), data.get('status', 'Available'), id))
    else:
        c.execute("""UPDATE vehicles SET make=?, model=?, year=?, price=?, mileage=?, transmission=?, engine=?, tags=?, features=?, auction_grade=?, body_type=?, description=?, status=? WHERE id=?""",
                  (data.get('make'), data.get('model'), data.get('year'), data.get('price'), data.get('mileage'), data.get('transmission'), data.get('engine'), data.get('tags'), data.get('features'), data.get('auction_grade'), data.get('body_type', 'JDM Import'), data.get('description', ''), data.get('status', 'Available'), id))

    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/admin/vehicles/<int:id>', methods=['DELETE'])
def delete_vehicle(id):
    if not session.get('admin_logged_in'):
        return jsonify({"error": "Unauthorized"}), 401
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM vehicles WHERE id=?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# --- SEO SSR Routing ---
@app.route('/vehicle/<int:id>')
def serve_vehicle_seo(id):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM vehicles WHERE id=?", (id,))
    row = c.fetchone()
    similar = []
    if row:
        c.execute("SELECT * FROM vehicles WHERE body_type=? AND id!=? AND status!='Sold' LIMIT 3", (row['body_type'], id))
        similar = [dict(r) for r in c.fetchall()]
    conn.close()
    if row:
        return render_template('vehicle.html', vehicle=dict(row), similar=similar)
    return "Vehicle Not Found", 404

# --- Enquiries Endpoints ---
@app.route('/api/enquiries', methods=['POST'])
def submit_enquiry():
    data = request.json
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT INTO enquiries (name, phone, email, vehicle, message, marketing_opt_in) VALUES (?,?,?,?,?,?)",
              (data.get('name'), data.get('phone'), data.get('email'), data.get('vehicle'), data.get('message'), data.get('marketing_opt_in', False)))
    conn.commit()
    conn.close()

    # Background Email Notification Logic
    try:
        smtp_server = os.environ.get('SMTP_SERVER')
        smtp_port = int(os.environ.get('SMTP_PORT', 587))
        smtp_user = os.environ.get('SMTP_USER')
        smtp_pass = os.environ.get('SMTP_PASSWORD')
        notify_email = os.environ.get('NOTIFICATION_EMAIL')
        
        if smtp_server and smtp_user and smtp_pass and notify_email:
            msg_body = f"""New Dealership Enquiry!

Name: {data.get('name')}
Phone: {data.get('phone')}
Email: {data.get('email')}
Vehicle of Interest: {data.get('vehicle')}
Marketing Opt-In: {"Yes" if data.get('marketing_opt_in') else "No"}

Message: 
{data.get('message')}
"""
            msg = MIMEText(msg_body)
            msg['Subject'] = f"New Lead: {data.get('vehicle')} - {data.get('name')}"
            msg['From'] = smtp_user
            msg['To'] = notify_email
            
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            server.quit()
    except Exception as e:
        print(f"Failed to send email notification: {e}")

    # Twilio SMS Notification Logic
    try:
        twilio_sid = os.environ.get('TWILIO_ACCOUNT_SID')
        twilio_token = os.environ.get('TWILIO_AUTH_TOKEN')
        twilio_from = os.environ.get('TWILIO_FROM_NUMBER')
        twilio_to = os.environ.get('TWILIO_TO_NUMBER')
        
        if twilio_sid and twilio_token and twilio_from and twilio_to:
            from twilio.rest import Client
            client = Client(twilio_sid, twilio_token)
            sms_body = f"NEW LEAD: {data.get('name')} is inquiring about the {data.get('vehicle')}. Phone: {data.get('phone')}"
            client.messages.create(
                body=sms_body,
                from_=twilio_from,
                to=twilio_to
            )
    except Exception as e:
        print(f"Failed to send SMS notification: {e}")

    return jsonify({"success": True})

@app.route('/api/admin/enquiries', methods=['GET'])
def get_enquiries():
    if not session.get('admin_logged_in'):
        return jsonify({"error": "Unauthorized"}), 401
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM enquiries ORDER BY timestamp DESC")
    enquiries = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(enquiries)

@app.route('/api/admin/enquiries/<int:id>', methods=['DELETE'])
def delete_enquiry(id):
    if not session.get('admin_logged_in'):
        return jsonify({"error": "Unauthorized"}), 401
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM enquiries WHERE id=?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(port=3000, debug=True)
