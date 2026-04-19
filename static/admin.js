document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('loginScreen');
  const adminDashboard = document.getElementById('adminDashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');
  
  const addVehicleForm = document.getElementById('addVehicleForm');
  const vehicleModal = document.getElementById('vehicleModal');
  const addCarBtn = document.getElementById('addCarBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  
  const stockTableBody = document.getElementById('stockTableBody');
  const enquiryTableBody = document.getElementById('enquiryTableBody');
  
  const searchInput = document.getElementById('adminSearchStock');
  let currentVehicles = [];

  // Check if logged in on load
  fetch('/api/admin/status')
    .then(res => res.json())
    .then(data => {
      if (data.logged_in) {
        showDashboard();
      }
    });

  // Handle Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value;
    
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (res.ok) {
      document.getElementById('passwordInput').value = '';
      showDashboard();
    } else {
      loginError.classList.remove('hidden');
    }
  });

  // Handle Logout
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    adminDashboard.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  });

  function showDashboard() {
    loginScreen.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    loginError.classList.add('hidden');
    loadStockTable();
    loadEnquiriesTable();
  }
  
  // MODAL LOGIC
  addCarBtn.addEventListener('click', () => {
     exitEditMode();
     vehicleModal.style.display = 'flex';
  });
  closeModalBtn.addEventListener('click', () => { vehicleModal.style.display = 'none'; });
  cancelEditBtn.addEventListener('click', () => { vehicleModal.style.display = 'none'; exitEditMode(); });
  vehicleModal.addEventListener('click', (e) => {
      if(e.target === vehicleModal) vehicleModal.style.display = 'none';
  });

  // Filter Logic
  searchInput.addEventListener('input', (e) => {
     const val = e.target.value.toLowerCase();
     const trs = stockTableBody.querySelectorAll('tr');
     trs.forEach(tr => {
         const text = tr.textContent.toLowerCase();
         tr.style.display = text.includes(val) ? '' : 'none';
     });
  });

  // Load Stock Data & Process KPIs
  async function loadStockTable() {
    const res = await fetch('/api/vehicles');
    currentVehicles = await res.json();
    
    document.getElementById('stockCount').textContent = currentVehicles.length + " Total Listed";
    
    // KPI Math
    let active = 0; let reserved = 0;
    currentVehicles.forEach(v => {
       if(v.status === 'Available') active++;
       if(v.status === 'Reserved') reserved++;
    });
    document.getElementById('kpiTotal').textContent = active;
    document.getElementById('kpiReserved').textContent = reserved;
    
    renderStockTable(currentVehicles);
  }

  function renderStockTable(vehicles) {
    stockTableBody.innerHTML = '';
    vehicles.forEach(v => {
      const tr = document.createElement('tr');
      // Build Quick Status Dropdown
      const statusOptions = ['Available', 'Reserved', 'Sold'].map(st => {
          return `<option value="${st}" ${v.status === st ? 'selected' : ''}>${st}</option>`;
      }).join('');
      
      tr.innerHTML = `
        <td style="font-weight: 800; color: var(--accent-primary);">#${v.id}</td>
        <td>
           <strong style="font-size: 1rem; display: block; margin-bottom: 4px;">${v.year} ${v.make} ${v.model}</strong>
           <span style="font-size:0.75rem; color:var(--text-muted); background:var(--bg-secondary); padding: 2px 6px; border-radius: 4px;">${v.body_type || 'MPV'} | ${v.mileage} Mi | ${v.engine}</span>
        </td>
        <td style="font-weight: bold; font-family: monospace;">${v.price}</td>
        <td>
           <select class="quick-status ${v.status}" onchange="window.quickStatusChange(this, ${v.id})">
              ${statusOptions}
           </select>
        </td>
        <td>
          <button class="delete-btn" onclick="editVehicle(${v.id})" style="margin-right: 15px;" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="delete-btn" onclick="deleteVehicle(${v.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      `;
      stockTableBody.appendChild(tr);
    });
  }
  
  // Quick Status Override Handler
  window.quickStatusChange = async (selectEl, id) => {
      const newStatus = selectEl.value;
      const v = currentVehicles.find(x => x.id === id);
      if(!v) return;
      
      // We must reconstruct the standard edit FormData payload to preserve all other fields
      const formData = new FormData();
      formData.append('make', v.make || '');
      formData.append('model', v.model || '');
      formData.append('year', v.year || '');
      formData.append('price', v.price || '');
      formData.append('body_type', v.body_type || '');
      formData.append('mileage', v.mileage || '');
      formData.append('transmission', v.transmission || '');
      formData.append('engine', v.engine || '');
      formData.append('tags', v.tags || '');
      formData.append('auction_grade', v.auction_grade || '');
      formData.append('features', v.features || '');
      formData.append('description', v.description || '');
      
      // Override status
      formData.append('status', newStatus);
      
      // UI instant feedback
      selectEl.className = 'quick-status ' + newStatus;
      
      const res = await fetch(`/api/admin/vehicles/${id}`, {
          method: 'PUT',
          body: formData
      });
      
      if(res.ok) {
          console.log(`Vehicle ${id} marked as ${newStatus}`);
          loadStockTable(); // Refresh KPIs dynamically
      } else {
          alert('Failed to update status. Please try editing directly.');
      }
  };

  // Add/Edit Vehicle
  addVehicleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const editId = document.getElementById('edit_vehicle_id').value;
    const fileInput = document.getElementById('img_upload');
    
    if (!editId && fileInput.files.length === 0) {
      alert("Please upload at least one image to list a new vehicle.");
      return;
    }

    const formData = new FormData();
    formData.append('make', document.getElementById('make').value);
    formData.append('model', document.getElementById('model').value);
    formData.append('year', document.getElementById('year').value);
    formData.append('price', document.getElementById('price').value);
    formData.append('body_type', document.getElementById('body_type').value);
    formData.append('mileage', document.getElementById('mileage').value);
    formData.append('transmission', document.getElementById('transmission').value);
    formData.append('engine', document.getElementById('engine').value);
    formData.append('tags', document.getElementById('tags').value);
    formData.append('auction_grade', document.getElementById('auction_grade').value);
    formData.append('features', document.getElementById('features').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('status', document.getElementById('status').value);
    
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('img_upload', fileInput.files[i]);
    }

    const url = editId ? `/api/admin/vehicles/${editId}` : '/api/admin/vehicles';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      body: formData 
    });

    if (res.ok) {
      vehicleModal.style.display = 'none';
      exitEditMode();
      loadStockTable(); 
    } else {
      alert(`Failed to ${editId ? 'update' : 'add'} vehicle. Are you logged in?`);
    }
  });

  // Edit Mode Logic
  window.editVehicle = async (id) => {
    const res = await fetch(`/api/vehicles/${id}`);
    if (!res.ok) return alert('Failed to fetch vehicle details.');
    const v = await res.json();
    
    document.getElementById('edit_vehicle_id').value = v.id;
    document.getElementById('formTitle').textContent = `Editing Vehicle #${v.id}`;
    document.getElementById('submitBtn').textContent = 'Update Vehicle Configuration';
    document.getElementById('imgLabel').textContent = 'Sync New Images (Leave blank to keep existing)';
    
    document.getElementById('make').value = v.make;
    document.getElementById('model').value = v.model;
    document.getElementById('year').value = v.year;
    document.getElementById('price').value = v.price;
    document.getElementById('body_type').value = v.body_type || '';
    document.getElementById('mileage').value = v.mileage;
    document.getElementById('transmission').value = v.transmission;
    document.getElementById('engine').value = v.engine;
    document.getElementById('tags').value = v.tags || '';
    document.getElementById('auction_grade').value = v.auction_grade || '';
    document.getElementById('features').value = v.features || '';
    document.getElementById('description').value = v.description || '';
    document.getElementById('status').value = v.status || 'Available';
    
    vehicleModal.style.display = 'flex';
  };

  const exitEditMode = () => {
    addVehicleForm.reset();
    document.getElementById('edit_vehicle_id').value = '';
    document.getElementById('formTitle').textContent = 'Launch New Vehicle';
    document.getElementById('submitBtn').textContent = 'Deploy to Stock';
    document.getElementById('imgLabel').textContent = 'Upload Images (Select Multiple, First is Main)';
  };

  window.deleteVehicle = async (id) => {
    if (confirm('CRITICAL ACTION: Are you sure you want to permanently delete this vehicle from stock?')) {
      const res = await fetch(`/api/admin/vehicles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadStockTable();
      } else {
        alert('Failed to delete.');
      }
    }
  };

  function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Load Enquiries Data
  async function loadEnquiriesTable() {
    const res = await fetch('/api/admin/enquiries');
    if (!res.ok) return;
    const enquiries = await res.json();
    
    document.getElementById('kpiEnquiries').textContent = enquiries.length;
    enquiryTableBody.innerHTML = '';
    
    enquiries.forEach(e => {
      const tr = document.createElement('tr');
      const date = escapeHTML(new Date(e.timestamp).toLocaleString());
      const safeName = escapeHTML(e.name);
      const safePhone = escapeHTML(e.phone);
      const safeEmail = escapeHTML(e.email);
      const safeVehicle = escapeHTML(e.vehicle);
      const safeMessage = escapeHTML(e.message || 'No direct message left.');
      
      const marketingBadge = e.marketing_opt_in ? '<span style="font-size: 0.65rem; background-color: var(--accent-green); color: black; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: bold; text-transform: uppercase;"><i class="fas fa-check"></i> Marketing OK</span>' : '';
      
      tr.innerHTML = `
        <td style="font-size: 0.75rem; color: var(--text-muted);">${date}</td>
        <td>
           <strong style="font-size: 1rem;">${safeName}</strong>${marketingBadge}<br>
           <span style="font-size: 0.8rem; color: var(--text-muted);">${safePhone} | <a href="mailto:${safeEmail}" style="color: var(--accent-primary);">${safeEmail}</a></span>
        </td>
        <td>
           <span style="background-color: var(--bg-secondary); padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-weight: 500; display: inline-block; margin-bottom: 5px;">${safeVehicle}</span><br>
           <span style="font-size: 0.875rem; font-style: italic; color: #cbd5e1;">"${safeMessage}"</span>
           <div style="margin-top: 10px;">
               <button class="delete-btn" onclick="deleteEnquiry(${e.id})" style="font-size: 0.8rem; border: 1px solid var(--accent-primary); padding: 4px 10px; border-radius: 4px;"><i class="fas fa-check-circle"></i> Mark as Actioned</button>
           </div>
        </td>
      `;
      enquiryTableBody.appendChild(tr);
    });
  }

  window.deleteEnquiry = async (id) => {
      const res = await fetch(`/api/admin/enquiries/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadEnquiriesTable();
      } else {
        alert('Failed to clear enquiry.');
      }
  };

});
