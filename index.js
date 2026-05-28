document.addEventListener('DOMContentLoaded', function () {
    const root = document.documentElement;
    const loading = document.getElementById('loading');
    const detailDisplay = document.getElementById('detail-display');
    const dialog = document.getElementById('demoDialog');
    const demoButton = document.querySelector('.demo');
    const dialogContent = document.querySelector('.dialog-content');
    const demoVideo = document.getElementById('demoVideo');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: prefersReducedMotion ? 'auto' : 'smooth',
                    block: 'start'
                });

                history.replaceState(null, '', targetId);
            }
        });
    });

    if (loading) {
        window.setTimeout(function () {
            loading.classList.add('is-hidden');
        }, 900);
    }

    let ticking = false;
    function updateHeroZoom() {
        const maxScroll = Math.max(window.innerHeight * 0.75, 1);
        const progress = Math.min(window.scrollY / maxScroll, 1);
        root.style.setProperty('--hero-zoom', progress.toFixed(3));

        const workMaxScroll = Math.max(window.innerHeight, 1);
        const workProgress = Math.min(window.scrollY / workMaxScroll, 1);
        root.style.setProperty('--work-zoom', workProgress.toFixed(3));

        ticking = false;
    }

    function requestHeroZoomUpdate() {
        if (!ticking) {
            window.requestAnimationFrame(updateHeroZoom);
            ticking = true;
        }
    }

    updateHeroZoom();
    if (!prefersReducedMotion) {
        window.addEventListener('scroll', requestHeroZoomUpdate, { passive: true });
        window.addEventListener('resize', requestHeroZoomUpdate, { passive: true });
    }

    document.querySelectorAll('.btn_social').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const detail = this.getAttribute('data-detail');
            detailDisplay.innerText = detail;
            detailDisplay.style.display = 'block';
        });
    });

    if (dialog && demoButton && dialogContent && demoVideo) {
        demoButton.addEventListener('click', function () {
            dialogContent.classList.remove('hidden');
            dialog.showModal();
            demoVideo.src = 'https://www.youtube.com/embed/ztl50Ilu-sg';
        });

        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                dialogContent.classList.add('hidden');
                dialog.close();
                demoVideo.src = '';
            }
        });
    }
});
