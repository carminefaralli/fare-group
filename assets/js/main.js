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

});
