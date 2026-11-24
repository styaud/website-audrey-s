/* ==========================================================================
   script.js — Main site interactivity (vanilla JS, zero dependencies)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.site-nav');
  const hamburger = document.querySelector('button.hamburger');
  const navMenu = document.getElementById('primary-nav');

  if (hamburger && navMenu) {
    const desktop = window.matchMedia('(min-width: 1200px)');
    let previousOverflow = document.body.style.overflow;

    function closeMenu() {
      if (!navMenu.classList.contains('active')) return;
      hamburger.classList.remove('active');
      navMenu.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = previousOverflow;
    }

    hamburger.addEventListener('click', () => {
      if (navMenu.classList.contains('active')) {
        closeMenu();
      } else if (!desktop.matches) {
        previousOverflow = document.body.style.overflow;
        hamburger.classList.add('active');
        navMenu.classList.add('active');
        hamburger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
      }
    });

    navMenu.addEventListener('click', (event) => {
      if (event.target === navMenu || event.target.closest('a')) closeMenu();
    });
    document.addEventListener('click', (event) => {
      if (!navMenu.contains(event.target) && !hamburger.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navMenu.classList.contains('active')) {
        closeMenu();
        hamburger.focus();
      }
    });
    desktop.addEventListener('change', (event) => {
      if (event.matches) closeMenu();
    });
  }

  if (nav) {
    const updateNavScroll = () => nav.classList.toggle('scrolled', window.scrollY > 50);
    updateNavScroll();
    window.addEventListener('scroll', updateNavScroll, { passive: true });
  }

  const popup = document.getElementById('popup');
  const formModal = document.getElementById('form-modal');

  for (const dialog of [popup, formModal]) {
    if (!dialog) continue;
    document.getElementById(`${dialog.id}-close`)?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) {
        dialog.close();
      }
    });
  }

  if (popup) popup.showModal();

  const contactForm = document.getElementById('contact-form');

  if (contactForm) {
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const submitLabel = submitBtn.querySelector('.btn-label');
    const submitBtnOriginalText = submitLabel.textContent;
    // Every message comes from the content (data-* attributes on the form).
    // The server answers with a key of this object; other values show msgs.error.
    const msgs = { ...contactForm.dataset };
    const fill = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);

    // Inline validation: French messages under each required field, shown after the first visit.
    const requiredFields = Array.from(contactForm.querySelectorAll('input[required], textarea[required]'));

    function validateField(field) {
      const message = field.validity.valueMissing ? msgs.required
        : field.validity.typeMismatch ? msgs.emailInvalid : '';
      const error = document.getElementById(`${field.id}-error`);
      if (error) error.textContent = message;
      field.classList.toggle('input-error', Boolean(message));
      field.classList.toggle('is-valid', !message);
      field.setAttribute('aria-invalid', String(Boolean(message)));
      return !message;
    }

    requiredFields.forEach((field) => {
      field.addEventListener('blur', () => { if (field.value || field.dataset.touched) validateField(field); field.dataset.touched = '1'; });
      field.addEventListener('input', () => { if (field.classList.contains('input-error') || field.classList.contains('is-valid')) validateField(field); });
    });

    const message = document.getElementById('contact-message');
    const messageCount = document.getElementById('contact-message-count');
    const updateCount = () => { messageCount.textContent = `${message.value.length} / ${message.maxLength}`; };
    message.addEventListener('input', updateCount);
    const formModalMessage = document.getElementById('form-modal-message');
    const subjectSelect = document.getElementById('subject-select');
    const subjectToggle = document.getElementById('subject-toggle');
    const subjectList = document.getElementById('subject-listbox');
    const subjectChips = document.getElementById('subject-chips');
    const subjectInputs = document.getElementById('subject-inputs');
    const subjectError = document.getElementById('subject-error');
    const subjectStatus = document.getElementById('subject-status');
    const subjectPlaceholder = document.getElementById('subject-placeholder');
    const subjectPlaceholderText = subjectPlaceholder.textContent;
    const options = Array.from(subjectList.querySelectorAll('[role="option"]'));
    const selectedSubjects = [];
    let activeIndex = -1;
    let sending = false;

    function setSubjectError(message) {
      subjectError.textContent = message;
      subjectToggle.setAttribute('aria-invalid', String(Boolean(message) && selectedSubjects.length === 0));
    }

    function renderSubjects() {
      options.forEach((option) => {
        option.setAttribute('aria-selected', String(selectedSubjects.includes(option.dataset.value)));
      });
      subjectChips.replaceChildren();
      subjectInputs.replaceChildren();
      selectedSubjects.forEach((subject, index) => {
        const chip = document.createElement('span');
        chip.className = 'subject-chip';
        const label = document.createElement('span');
        label.textContent = subject;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'subject-chip-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', fill(msgs.subjectRemove, { sujet: subject }));
        remove.addEventListener('click', () => {
          selectedSubjects.splice(index, 1);
          renderSubjects();
          const buttons = subjectChips.querySelectorAll('button');
          (buttons[Math.min(index, buttons.length - 1)] || subjectToggle).focus();
        });
        chip.append(label, remove);
        subjectChips.append(chip);

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'subjects';
        input.value = subject;
        subjectInputs.append(input);
      });
      setSubjectError('');
      const count = selectedSubjects.length;
      const countText = fill(count === 1 ? msgs.subjectCountOne : msgs.subjectCountOther, { n: count });
      subjectPlaceholder.textContent = count === 0 ? subjectPlaceholderText : countText;
      subjectToggle.classList.toggle('has-value', count > 0);
      subjectStatus.textContent = count === 0 ? msgs.subjectNone : countText;
    }

    function setActiveOption(index) {
      if (!options.length) return;
      options[activeIndex]?.classList.remove('is-active');
      activeIndex = Math.max(0, Math.min(index, options.length - 1));
      const option = options[activeIndex];
      option.classList.add('is-active');
      subjectToggle.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function openSubjects(index = activeIndex < 0 ? 0 : activeIndex) {
      if (!options.length) return;
      subjectList.hidden = false;
      subjectToggle.setAttribute('aria-expanded', 'true');
      setActiveOption(index);
    }

    function closeSubjects() {
      subjectList.hidden = true;
      subjectToggle.setAttribute('aria-expanded', 'false');
      subjectToggle.removeAttribute('aria-activedescendant');
      options[activeIndex]?.classList.remove('is-active');
    }

    function toggleSubject(subject) {
      const index = selectedSubjects.indexOf(subject);
      if (index !== -1) {
        selectedSubjects.splice(index, 1);
      } else if (selectedSubjects.length < 10) {
        selectedSubjects.push(subject);
      } else {
        setSubjectError(msgs.subjectLimit);
        return;
      }
      renderSubjects();
    }

    subjectToggle.addEventListener('click', () => {
      subjectToggle.focus();
      if (subjectList.hidden) openSubjects();
      else closeSubjects();
    });
    subjectToggle.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (subjectList.hidden) openSubjects(0);
          else setActiveOption(activeIndex + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (subjectList.hidden) openSubjects(options.length - 1);
          else setActiveOption(activeIndex - 1);
          break;
        case 'Home':
          event.preventDefault();
          openSubjects(0);
          break;
        case 'End':
          event.preventDefault();
          openSubjects(options.length - 1);
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (subjectList.hidden) openSubjects();
          else if (activeIndex >= 0) toggleSubject(options[activeIndex].dataset.value);
          break;
        case 'Backspace':
          if (subjectList.hidden && selectedSubjects.length) {
            event.preventDefault();
            selectedSubjects.pop();
            renderSubjects();
          }
          break;
      }
    });
    subjectSelect.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') closeSubjects();
      if (event.key === 'Escape' && !subjectList.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeSubjects();
        subjectToggle.focus();
      }
    });
    subjectList.addEventListener('mousedown', (event) => event.preventDefault());
    options.forEach((option, index) => {
      option.addEventListener('click', () => {
        subjectToggle.focus();
        setActiveOption(index);
        toggleSubject(option.dataset.value);
      });
    });
    document.addEventListener('click', (event) => {
      if (!subjectSelect.contains(event.target)) closeSubjects();
    });
    subjectSelect.addEventListener('focusout', (event) => {
      if (!subjectSelect.contains(event.relatedTarget)) closeSubjects();
    });
    renderSubjects();

    function showFormModal(message) {
      formModalMessage.textContent = message;
      if (!formModal.open) formModal.showModal();
    }

    function resetForm() {
      contactForm.reset();
      requiredFields.forEach((field) => {
        field.classList.remove('input-error', 'is-valid');
        field.removeAttribute('aria-invalid');
        delete field.dataset.touched;
        const error = document.getElementById(`${field.id}-error`);
        if (error) error.textContent = '';
      });
      updateCount();
      selectedSubjects.length = 0;
      closeSubjects();
      activeIndex = -1;
      renderSubjects();
      if (typeof window.turnstile?.reset === 'function') window.turnstile.reset();
    }

    contactForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (sending) return;

      const formData = new FormData(contactForm);
      const data = Object.fromEntries(formData);
      data.subjects = formData.getAll('subjects');
      data['cf-turnstile-response'] = formData.get('cf-turnstile-response') || '';

      // Accept the honeypot without a network request.
      if (data.bot_field) {
        resetForm();
        showFormModal(msgs.success);
        return;
      }

      const invalidField = requiredFields.filter((field) => !validateField(field))[0];
      const subjectsValid = data.subjects.length > 0;
      setSubjectError(subjectsValid ? '' : msgs.subjectRequired);
      if (invalidField) {
        invalidField.focus();
        return;
      }
      if (!subjectsValid) {
        subjectToggle.focus();
        openSubjects();
        return;
      }

      closeSubjects();
      sending = true;
      submitBtn.disabled = true;
      submitLabel.textContent = msgs.sending;
      contactForm.setAttribute('aria-busy', 'true');

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await response.json().catch(() => null);

        if (response.ok && result?.success === true) {
          resetForm();
          showFormModal(msgs.success);
        } else {
          const code = typeof result?.error === 'string' ? result.error : '';
          showFormModal(Object.hasOwn(msgs, code) && msgs[code] ? msgs[code] : msgs.error);
        }
      } catch {
        showFormModal(msgs.networkError);
      } finally {
        sending = false;
        submitBtn.disabled = false;
        submitLabel.textContent = submitBtnOriginalText;
        contactForm.removeAttribute('aria-busy');
      }
    });
  }

  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (!reducedMotion.matches && 'IntersectionObserver' in window && revealElements.length) {
    // Keep .reveal-pending until the fade ends: the end state needs its transition.
    // Then remove it, so the element gets its own transitions back (for example, button hover).
    const settle = (event) => {
      if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return;
      event.currentTarget.classList.remove('reveal-pending');
      event.currentTarget.removeEventListener('transitionend', settle);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.addEventListener('transitionend', settle);
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    revealElements.forEach((element) => {
      observer.observe(element);
      element.classList.add('reveal-pending');
    });
    reducedMotion.addEventListener('change', (event) => {
      if (!event.matches) return;
      observer.disconnect();
      revealElements.forEach((element) => {
        element.classList.remove('reveal-pending');
        element.classList.add('revealed');
      });
    });
  } else {
    revealElements.forEach((element) => element.classList.add('revealed'));
  }

  // Scroll spy: mark the nav link of the section that crosses the middle of the viewport.
  // Sections without a nav link (hero) clear the mark.
  const spyLinks = document.querySelectorAll('.nav-link[href^="#"]');
  if (spyLinks.length && 'IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        spyLinks.forEach((link) => link.classList.toggle('is-current', link.hash === `#${entry.target.id}`));
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    document.querySelectorAll('main > section[id]').forEach((section) => spy.observe(section));
  }

  // Resources: the chips show only the cards of one category.
  // Without JS the chips stay hidden and all the cards show.
  const resourceFilters = document.querySelector('.resource-filters');
  if (resourceFilters) {
    const resourceCards = document.querySelectorAll('.resource-card');
    resourceFilters.hidden = false;
    resourceFilters.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (!chip) return;
      resourceFilters.querySelectorAll('[data-filter]').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
      resourceCards.forEach((card) => { card.hidden = Boolean(chip.dataset.filter) && card.dataset.category !== chip.dataset.filter; });
    });
  }

  // FAQ: only one answer is open at a time. Height changes are animated.
  // Without JS, the native <details> elements still open and close.
  const faqItems = [...document.querySelectorAll('.faq-item')];

  const setFaqOpen = (item, open) => {
    // Start from the current height, also when an animation is in progress.
    const from = item.getBoundingClientRect().height;
    item._faqAnimation?.cancel();
    item.classList.toggle('is-closing', !open);

    if (reducedMotion.matches) {
      item.open = open;
      item.classList.remove('is-closing');
      return;
    }

    item.open = false;
    const closedHeight = item.getBoundingClientRect().height;
    item.open = true; // Keep the answer visible while it closes.
    const openHeight = item.getBoundingClientRect().height;

    item.style.overflow = 'hidden';
    const animation = item.animate(
      { height: [`${from}px`, `${open ? openHeight : closedHeight}px`] },
      { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
    item._faqAnimation = animation;
    animation.onfinish = () => {
      item.open = open;
      item.classList.remove('is-closing');
      item.style.overflow = '';
      item._faqAnimation = null;
    };
    animation.oncancel = () => { item.style.overflow = ''; };
  };

  faqItems.forEach((item) => {
    item.querySelector('.faq-question').addEventListener('click', (event) => {
      event.preventDefault();
      const open = !item.open || item.classList.contains('is-closing');
      if (open) {
        faqItems.forEach((other) => {
          if (other !== item && other.open && !other.classList.contains('is-closing')) setFaqOpen(other, false);
        });
      }
      setFaqOpen(item, open);
    });
  });
});
