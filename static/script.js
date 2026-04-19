document.addEventListener('DOMContentLoaded', () => {
  // Sticky Header
  const header = document.querySelector('header');
  
  const toggleSticky = () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', toggleSticky);
  toggleSticky(); // Init

  // Mobile Menu
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');

  if (mobileBtn && navLinks) {
    mobileBtn.addEventListener('click', () => {
      navLinks.classList.toggle('show');
      const icon = mobileBtn.querySelector('i');
      if (navLinks.classList.contains('show')) {
        icon.classList.remove('fa-bars');
        icon.classList.add('fa-times');
      } else {
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
      }
    });
  }

  // Auto-Inject High-Visibility GDPR Cookie Banner
  if (!localStorage.getItem('aps_cookie_consent')) {
    const cookieBanner = document.createElement('div');
    cookieBanner.innerHTML = `
      <div style="position: fixed; bottom: 0; left: 0; width: 100%; background-color: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px); border-top: 1px solid var(--border-color); padding: 20px; display: flex; justify-content: space-between; align-items: center; z-index: 99999; box-shadow: 0 -10px 40px rgba(0,0,0,0.8); flex-wrap: wrap; gap: 20px;">
        <div style="font-size: 0.875rem; color: var(--text-muted); flex: 1; min-width: 250px;">
          <strong style="color: white; font-size: 1rem; margin-bottom: 5px; display: block;"><i class="fas fa-cookie-bite" style="color: var(--accent-primary);"></i> Cookie Preferences</strong>
          We use strictly necessary cookies to ensure the website functions securely, and optional statistical cookies to track analytical traffic. By clicking "Accept All", you consent to our use of all cookies in accordance with UK GDPR. <a href="/cookie-policy.html" style="color: var(--accent-primary); text-decoration: underline;">Read Cookie Policy</a>
        </div>
        <div style="display: flex; gap: 15px;">
          <button id="declineCookies" class="btn" style="background: none; border: 1px solid var(--border-color); color: var(--text-muted); padding: 10px 20px; border-radius: 4px; cursor: pointer; transition: 0.3s; font-size: 0.875rem;" onmouseover="this.style.color='white'" onmouseout="this.style.color='var(--text-muted)'">Decline Optional</button>
          <button id="acceptCookies" class="btn btn-primary" style="padding: 10px 25px; box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4); font-size: 0.875rem;">Accept All</button>
        </div>
      </div>
    `;
    document.body.appendChild(cookieBanner);

    document.getElementById('acceptCookies').addEventListener('click', () => {
      localStorage.setItem('aps_cookie_consent', 'accepted');
      cookieBanner.style.opacity = '0';
      cookieBanner.style.transition = 'opacity 0.4s';
      setTimeout(() => cookieBanner.remove(), 400);
    });

    document.getElementById('declineCookies').addEventListener('click', () => {
      localStorage.setItem('aps_cookie_consent', 'declined_optional');
      cookieBanner.style.opacity = '0';
      cookieBanner.style.transition = 'opacity 0.4s';
      setTimeout(() => cookieBanner.remove(), 400);
    });
  }
});
