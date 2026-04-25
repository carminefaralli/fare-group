/* ═══ FAR.E Group — main.js ═══ */

document.addEventListener('DOMContentLoaded', function() {

  /* ── Mobile menu toggle ── */
  var toggle = document.querySelector('.nav-toggle');
  var navR = document.querySelector('.nav-r');
  if (toggle && navR) {
    toggle.addEventListener('click', function() {
      navR.classList.toggle('open');
      var spans = toggle.querySelectorAll('span');
      if (navR.classList.contains('open')) {
        spans[0].style.transform = 'rotate(45deg) translate(3px, 3px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(3px, -3px)';
      } else {
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      }
    });
    // Close mobile menu on link click
    navR.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function() {
        navR.classList.remove('open');
        var spans = toggle.querySelectorAll('span');
        spans[0].style.transform = '';
        spans[1].style.opacity = '';
        spans[2].style.transform = '';
      });
    });
  }

  /* ── Governance cycle (Modello page) ── */
  var steps = document.querySelectorAll('.gov-cycle .gov-step');
  var details = document.querySelectorAll('.gov-detail');
  if (steps.length && details.length) {
    steps.forEach(function(step, idx) {
      step.addEventListener('click', function() {
        var wasActive = step.classList.contains('active');
        steps.forEach(function(s) { s.classList.remove('active'); });
        details.forEach(function(d) { d.classList.remove('show'); });
        if (!wasActive) {
          step.classList.add('active');
          var detail = document.getElementById('detail-' + idx);
          if (detail) detail.classList.add('show');
        }
      });
    });
  }

  /* ── Smooth scroll for anchor links ── */
  document.querySelectorAll('a[href^="#"]').forEach(function(a) {
    a.addEventListener('click', function(e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ── Contact form submit (POST /api/contact) ── */
  var contactForm = document.getElementById('contact-form');
  if (contactForm) {
    var lang = (contactForm.getAttribute('data-lang') === 'en') ? 'en' : 'it';
    var i18n = {
      it: {
        sending: 'Invio in corso...',
        success: 'Richiesta inviata. Ti ricontatteremo a breve.',
        invalid: 'Compila i campi obbligatori e accetta la privacy policy.',
        invalidEmail: 'Inserisci un indirizzo email valido.',
        network: 'Errore di rete. Riprova fra qualche istante.',
        serverErr: 'Si è verificato un errore. Riprova più tardi.'
      },
      en: {
        sending: 'Sending...',
        success: 'Request sent. We will get back to you shortly.',
        invalid: 'Please fill in the required fields and accept the privacy policy.',
        invalidEmail: 'Please enter a valid email address.',
        network: 'Network error. Please try again in a moment.',
        serverErr: 'Something went wrong. Please try again later.'
      }
    }[lang];

    var statusEl = contactForm.querySelector('.form-status');
    var submitBtn = contactForm.querySelector('.submit-btn');

    function setStatus(message, kind) {
      if (!statusEl) return;
      statusEl.textContent = message || '';
      statusEl.classList.remove('is-success', 'is-error');
      if (kind) statusEl.classList.add('is-' + kind);
    }

    function clearFieldErrors() {
      contactForm.querySelectorAll('.field-error').forEach(function(el) {
        el.classList.remove('field-error');
      });
    }

    function markFieldError(name) {
      var el = contactForm.querySelector('[name="' + name + '"]');
      if (el) el.classList.add('field-error');
    }

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFieldErrors();

      var fd = new FormData(contactForm);
      var payload = {
        firstName: (fd.get('firstName') || '').toString().trim(),
        lastName:  (fd.get('lastName')  || '').toString().trim(),
        email:     (fd.get('email')     || '').toString().trim(),
        company:   (fd.get('company')   || '').toString().trim(),
        role:      (fd.get('role')      || '').toString().trim(),
        type:      (fd.get('type')      || '').toString().trim(),
        message:   (fd.get('message')   || '').toString().trim(),
        privacy:   fd.get('privacy') === 'true' || fd.get('privacy') === 'on',
        website:   (fd.get('website')   || '').toString(), // honeypot
        lang:      lang
      };

      // Client-side validation
      var missing = [];
      if (!payload.firstName) missing.push('firstName');
      if (!payload.lastName)  missing.push('lastName');
      if (!payload.email)     missing.push('email');
      if (!payload.message)   missing.push('message');
      if (!payload.privacy)   missing.push('privacy');

      if (missing.length) {
        missing.forEach(markFieldError);
        setStatus(i18n.invalid, 'error');
        return;
      }
      if (!EMAIL_RE.test(payload.email)) {
        markFieldError('email');
        setStatus(i18n.invalidEmail, 'error');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      setStatus(i18n.sending, null);

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function(r) {
          return r.json().then(function(j) { return { status: r.status, body: j }; }).catch(function() {
            return { status: r.status, body: {} };
          });
        })
        .then(function(res) {
          if (res.status >= 200 && res.status < 300 && res.body && res.body.ok) {
            setStatus(i18n.success, 'success');
            contactForm.reset();
          } else if (res.status === 400 && res.body && res.body.fields) {
            res.body.fields.forEach(markFieldError);
            setStatus(i18n.invalid, 'error');
          } else {
            setStatus(i18n.serverErr, 'error');
          }
        })
        .catch(function() {
          setStatus(i18n.network, 'error');
        })
        .then(function() {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

});
