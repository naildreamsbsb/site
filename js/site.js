const body = document.body;
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
const navLinks = document.querySelectorAll(".main-nav a");
const siteHeader = document.querySelector(".site-header");
let headerScrollFrame = null;

function updateHeaderScrollState() {
  siteHeader?.classList.toggle("is-scrolled", window.scrollY > 20);
  headerScrollFrame = null;
}

if (siteHeader) {
  updateHeaderScrollState();
  window.addEventListener("scroll", () => {
    if (headerScrollFrame !== null) return;
    headerScrollFrame = window.requestAnimationFrame(updateHeaderScrollState);
  }, { passive: true });
}

function setMenuOpen(isOpen) {
  body.classList.toggle("menu-open", isOpen);
  mainNav?.classList.toggle("active", isOpen);
  menuToggle?.classList.toggle("active", isOpen);
  menuToggle?.setAttribute("aria-expanded", String(isOpen));
}

if (menuToggle && mainNav) {
  menuToggle.addEventListener("click", () => {
    setMenuOpen(!body.classList.contains("menu-open"));
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => setMenuOpen(false));
});

const cmwCarousel = document.querySelector(".cmw-memory-carousel");

if (cmwCarousel) {
  const stack = cmwCarousel.querySelector(".cmw-memory-stack");
  const cards = [...cmwCarousel.querySelectorAll(".cmw-memory-card")];
  const status = cmwCarousel.querySelector(".cmw-memory-status");
  let activeIndex = 0;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let dragX = 0;

  function renderCmwCarousel() {
    cards.forEach((card, index) => {
      const position = (index - activeIndex + cards.length) % cards.length;
      const visiblePosition = position < 3 ? String(position) : "hidden";
      card.dataset.position = visiblePosition;
      card.setAttribute("aria-hidden", String(position !== 0));
    });
    status.textContent = `${activeIndex + 1} de ${cards.length}`;
  }

  function moveCmwCarousel(direction) {
    activeIndex = (activeIndex + direction + cards.length) % cards.length;
    renderCmwCarousel();
  }

  function finishCmwDrag(event) {
    if (event.pointerId !== pointerId) return;
    const movedHorizontally = Math.abs(dragX) >= 42;
    stack.classList.remove("is-dragging");
    stack.style.removeProperty("--cmw-drag-x");
    pointerId = null;
    if (movedHorizontally) moveCmwCarousel(dragX < 0 ? 1 : -1);
    else if (Math.abs(dragX) < 8 && Math.abs(event.clientY - startY) < 8) moveCmwCarousel(1);
  }

  stack.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragX = 0;
    stack.classList.add("is-dragging");
    stack.setPointerCapture?.(pointerId);
  });

  stack.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    dragX = deltaX;
    stack.style.setProperty("--cmw-drag-x", `${dragX}px`);
  });

  stack.addEventListener("pointerup", finishCmwDrag);
  stack.addEventListener("pointercancel", finishCmwDrag);
  cmwCarousel.querySelector("[data-cmw-previous]").addEventListener("click", () => moveCmwCarousel(-1));
  cmwCarousel.querySelector("[data-cmw-next]").addEventListener("click", () => moveCmwCarousel(1));
  cmwCarousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") moveCmwCarousel(-1);
    if (event.key === "ArrowRight") moveCmwCarousel(1);
  });

  renderCmwCarousel();
}

const cmwStoryModal = document.querySelector(".cmw-story-modal");
const cmwStoryDialog = cmwStoryModal?.querySelector("[role='dialog']");
const cmwStoryOpenButtons = document.querySelectorAll("[data-cmw-story-open]");
const cmwStoryCloseButtons = cmwStoryModal?.querySelectorAll("[data-cmw-story-close]") || [];
let cmwStoryTrigger = null;

function openCmwStory(event) {
  if (!cmwStoryModal || !cmwStoryDialog) return;
  cmwStoryTrigger = event.currentTarget;
  body.classList.add("cmw-story-open");
  cmwStoryModal.setAttribute("aria-hidden", "false");
  cmwStoryDialog.focus();
}

function closeCmwStory() {
  if (!cmwStoryModal) return;
  body.classList.remove("cmw-story-open");
  cmwStoryModal.setAttribute("aria-hidden", "true");
  cmwStoryTrigger?.focus();
  cmwStoryTrigger = null;
}

cmwStoryOpenButtons.forEach((button) => button.addEventListener("click", openCmwStory));
cmwStoryCloseButtons.forEach((button) => button.addEventListener("click", closeCmwStory));

cmwStoryModal?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCmwStory();
    return;
  }

  if (event.key !== "Tab") return;
  const focusableElements = [...cmwStoryModal.querySelectorAll("button, [href], [tabindex]:not([tabindex='-1'])")];
  const firstElement = focusableElements[0];
  const lastElement = focusableElements.at(-1);

  if (event.shiftKey && (document.activeElement === firstElement || document.activeElement === cmwStoryDialog)) {
    event.preventDefault();
    lastElement?.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement?.focus();
  }
});

const lightbox = document.querySelector(".lightbox");
const lightboxImage = document.querySelector(".lightbox img");
const closeLightbox = document.querySelector(".lightbox-close");

document.querySelectorAll(".gallery-item").forEach((item) => {
  item.addEventListener("click", () => {
    const img = item.querySelector("img");
    const full = item.dataset.full || img.src;

    lightboxImage.src = full;
    lightboxImage.alt = img.alt || "Imagem ampliada";
    body.classList.add("lightbox-open");
    lightbox.setAttribute("aria-hidden", "false");
  });
});

function closeGallery() {
  body.classList.remove("lightbox-open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.src = "";
}

closeLightbox?.addEventListener("click", closeGallery);

lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeGallery();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && body.classList.contains("lightbox-open")) {
    closeGallery();
  }
});
