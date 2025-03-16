document.addEventListener('DOMContentLoaded', function () {
    $(document).ready(function () {
        $("a").on('click', function (event) {
            if (this.hash !== "") {
                event.preventDefault();
                var hash = this.hash;
                $('body,html').animate({
                    scrollTop: $(hash).offset().top
                }, 1200, function () {
                    window.location.hash = hash;
                });
            }
        });

        $("#middle").css("background-size", "100% auto");

        setTimeout(function () {
            $("#loading").addClass("animated fadeOut");
            setTimeout(function () {
                $("#loading").removeClass("animated fadeOut");
                $("#loading").css("display", "none");
            }, 800);
        }, 1450);
        /*
                let typingInProgress = false;
                let currentInterval;
                let activeCategory = null;
        
                function typeText(element, text) {
                    let index = 0;
                    element.text('');
                    clearInterval(currentInterval);
                    typingInProgress = true;
                    currentInterval = setInterval(function () {
                        if (index < text.length) {
                            element.append(text.charAt(index++));
                        } else {
                            clearInterval(currentInterval);
                            typingInProgress = false;
                        }
                    }, 60);
                }
        
                function untypeText(element, callback) {
                    let text = element.text();
                    let index = text.length;
                    clearInterval(currentInterval);
                    currentInterval = setInterval(function () {
                        if (index > 0) {
                            element.text(text.substring(0, --index));
                        } else {
                            clearInterval(currentInterval);
                            typingInProgress = false;
                            if (callback) callback();
                        }
                    }, 30);
                }
        
                $(".skill").on('click', function () {
                    var iconName = $(this).data("icon");
                    let currentCategory = $(this).closest(".skills-category");
                    let span = currentCategory.find("h2 .skill-name");
        
                    if (typingInProgress) clearInterval(currentInterval);
        
                    if (activeCategory) {
                        let activeSpan = activeCategory.find("h2 .skill-name");
                        untypeText(activeSpan, function () {
                            activeSpan.text('');
                            typeText(span, " with " + iconName);
                        });
                    } else {
                        typeText(span, " with " + iconName);
                    }
        
                    activeCategory = currentCategory;
                });
                */
    });

    var width = $(window).width();

    window.onscroll = function () {
        if ((width >= 900)) {
            if (document.body.scrollTop > 80 || document.documentElement.scrollTop > 80) {
                $("#middle").css("background-size", "150% auto");
            } else {
                $("#middle").css("background-size", "100% auto");
            }
        }
    };

    setTimeout(function () {
        $("#loading").addClass("animated fadeOut");
    });

    document.querySelectorAll('.btn_social').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const detail = this.getAttribute('data-detail');
            const detailDisplay = document.getElementById('detail-display');
            detailDisplay.innerText = detail;
            detailDisplay.style.display = 'block';
        });
    });

    // Get the dialog
    var dialog = document.getElementById("demoDialog");

    // Get the button that opens the dialog
    var demo_btn = document.querySelector(".demo");

    // When the user clicks the button, open the dialog 
    demo_btn.onclick = function () {
        modal_div = document.querySelector(".dialog-content");
        modal_div.classList.remove("hidden");
        dialog.showModal();
        document.getElementById("demoVideo").src = "https://www.youtube.com/embed/ztl50Ilu-sg";
    }

    // When the user clicks anywhere outside of the dialog, close it
    dialog.addEventListener('click', function (event) {
        modal_div = document.querySelector(".dialog-content");
        modal_div.classList.add("hidden");
        if (event.target === dialog) {
            dialog.close();
            document.getElementById("demoVideo").src = "";
        }
    });
});