/* ==========================================================================
   script.js — Main site interactivity (vanilla JS, zero dependencies)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ========================================================================
     1. HAMBURGER MENU
     ======================================================================== */

  const hamburger = document.querySelector('.hamburger');
  const navMenu = document.querySelector('.nav-menu');

  if (hamburger && navMenu) {
    const navLinks = navMenu.querySelectorAll('.nav-link');

    function openMenu() {
      hamburger.classList.add('active');
      navMenu.classList.add('active');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      hamburger.classList.remove('active');
      navMenu.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = 'auto';
    }

    function toggleMenu() {
      if (navMenu.classList.contains('active')) {
        closeMenu();
      } else {
        openMenu();
      }
    }

    hamburger.addEventListener('click', toggleMenu);

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('active')) {
        closeMenu();
        hamburger.focus();
      }
    });

    // Close when clicking any link inside the menu (nav links + CTA button)
    navMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        closeMenu();
      });
    });

    // Close when clicking on the nav-menu backdrop itself (not its children)
    navMenu.addEventListener('click', (e) => {
      if (e.target === navMenu) {
        closeMenu();
      }
    });
  }

  /* ========================================================================
     2. HEADER SCROLL EFFECT
     ======================================================================== */

  const nav = document.querySelector('.site-nav');

  if (nav) {
    function updateNavScroll() {
      if (window.scrollY > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }

    // Set initial state
    updateNavScroll();

    window.addEventListener('scroll', updateNavScroll, { passive: true });
  }

  /* ========================================================================
     3. SMOOTH SCROLL WITH HEADER OFFSET
     ======================================================================== */

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#' || targetId === '') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const headerOffset = nav ? nav.offsetHeight : 0;
      const elementPosition = target.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    });
  });

  /* ========================================================================
     4. FAQ ACCORDION
     ======================================================================== */

  const accordionHeaders = document.querySelectorAll('.accordion-header');

  accordionHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const parentItem = header.closest('.accordion-item');
      const content = parentItem.querySelector('.accordion-content');
      const isActive = parentItem.classList.contains('active');

      // Close all other open items
      accordionHeaders.forEach((otherHeader) => {
        const otherItem = otherHeader.closest('.accordion-item');
        const otherContent = otherItem.querySelector('.accordion-content');
        if (otherItem !== parentItem && otherItem.classList.contains('active')) {
          otherItem.classList.remove('active');
          otherContent.style.maxHeight = '0';
          otherHeader.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current item
      if (isActive) {
        parentItem.classList.remove('active');
        content.style.maxHeight = '0';
        header.setAttribute('aria-expanded', 'false');
      } else {
        parentItem.classList.add('active');
        content.style.maxHeight = content.scrollHeight + 'px';
        header.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ========================================================================
     5. POPUP MODAL
     ======================================================================== */

  const popup = document.getElementById('popup');

  if (popup && !sessionStorage.getItem('popup-dismissed')) {
    const popupClose = document.getElementById('popup-close');
    const modal = popup.querySelector('.modal');

    // Show the popup — body scroll is already locked by the modal-backdrop
    document.body.style.overflow = 'hidden';

    function closePopup() {
      popup.remove();
      sessionStorage.setItem('popup-dismissed', 'true');
      document.body.style.overflow = '';
    }

    // Close on button click
    if (popupClose) {
      popupClose.addEventListener('click', closePopup);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.contains(popup)) {
        closePopup();
      }
    });

    // Close on backdrop click (outside modal)
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        closePopup();
      }
    });

    // Focus trap inside modal
    if (modal) {
      const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

      modal.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        const focusableElements = modal.querySelectorAll(focusableSelector);
        if (focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if focus is on first element, wrap to last
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else {
          // Tab: if focus is on last element, wrap to first
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
          }
        }
      });

      // Move initial focus into the modal
      const firstFocusable = modal.querySelector(focusableSelector);
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  }

  /* ========================================================================
     6. CONTACT FORM SUBMISSION
     ======================================================================== */

  const contactForm = document.getElementById('contact-form');

  if (contactForm) {
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const submitBtnOriginalText = submitBtn ? submitBtn.textContent : '';
    const msgs = {
      sending: contactForm.dataset.sending || 'Envoi en cours...',
      success: contactForm.dataset.success || 'Message envoyé.',
      error: contactForm.dataset.error || 'Une erreur est survenue.',
      network: contactForm.dataset.networkError || 'Erreur de connexion.',
    };
    const formModal = document.getElementById('form-modal');
    const formModalIcon = document.getElementById('form-modal-icon');
    const formModalMessage = document.getElementById('form-modal-message');
    const formModalClose = document.getElementById('form-modal-close');

    function showFormModal(success, message) {
      formModalIcon.textContent = success ? '\u2713' : '\u2717';
      formModalIcon.style.color = success ? 'var(--color-primary)' : 'var(--color-error)';
      formModalMessage.textContent = message;
      formModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }

    function closeFormModal() {
      formModal.classList.add('hidden');
      document.body.style.overflow = '';
    }

    if (formModalClose) formModalClose.addEventListener('click', closeFormModal);
    if (formModal) {
      formModal.addEventListener('click', (e) => {
        if (e.target === formModal) closeFormModal();
      });
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Gather form data
      const formData = new FormData(contactForm);
      const data = {};
      formData.forEach((value, key) => { data[key] = value; });

      // Honeypot check — silently pretend success
      if (data.bot_field) {
        showFormModal(true, msgs.success);
        contactForm.reset();
        return;
      }

      // Get Turnstile token
      const turnstileInput = contactForm.querySelector('input[name="cf-turnstile-response"]');
      if (turnstileInput && turnstileInput.value) {
        data.turnstileToken = turnstileInput.value;
      } else if (typeof turnstile !== 'undefined' && typeof turnstile.getResponse === 'function') {
        const token = turnstile.getResponse();
        if (token) data.turnstileToken = token;
      }

      // Show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = msgs.sending;
      }

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          showFormModal(true, msgs.success);
          contactForm.reset();
          if (typeof turnstile !== 'undefined' && typeof turnstile.reset === 'function') {
            turnstile.reset();
          }
        } else {
          showFormModal(false, result.error || msgs.error);
        }
      } catch {
        showFormModal(false, msgs.network);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtnOriginalText;
        }
      }
    });
  }

  /* ========================================================================
     7. LAZY SCROLL REVEAL
     ======================================================================== */

  const revealElements = document.querySelectorAll('.reveal-on-scroll');

  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    revealElements.forEach((el) => {
      revealObserver.observe(el);
    });
  }

});
