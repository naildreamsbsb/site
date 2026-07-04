import { supabaseClient } from "./supabase.js"
/**
 * Campanha temporária — Capital Moto Week
 * Para desativar manualmente, altere CMW_CAMPAIGN_ACTIVE para false.
 * Para programar fim automático, ajuste CMW_CAMPAIGN_END.
 */
const CMW_CAMPAIGN_ACTIVE = true;
const CMW_CAMPAIGN_END = "2026-08-10T23:59:59-03:00";
const CMW_POPUP_DELAY = 1400;
const CMW_STORAGE_KEY = "naildreams_cmw_popup_closed_date";

function isCmwCampaignVisible() {
  if (!CMW_CAMPAIGN_ACTIVE) return false;
  const endDate = new Date(CMW_CAMPAIGN_END);
  return Number.isNaN(endDate.getTime()) || new Date() <= endDate;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function openCmwPopup() {
  const popup = document.querySelector("#cmw-popup");
  if (!popup) return;
  document.body.classList.add("cmw-popup-open");
  popup.setAttribute("aria-hidden", "false");
}

function closeCmwPopup() {
  const popup = document.querySelector("#cmw-popup");
  if (!popup) return;
  document.body.classList.remove("cmw-popup-open");
  popup.setAttribute("aria-hidden", "true");
  localStorage.setItem(CMW_STORAGE_KEY, todayKey());
}

if (isCmwCampaignVisible()) {
  const strip = document.querySelector("#cmw-strip");
  if (strip) strip.hidden = false;

  const closedToday = localStorage.getItem(CMW_STORAGE_KEY) === todayKey();

  if (!closedToday) {
    window.setTimeout(openCmwPopup, CMW_POPUP_DELAY);
  }

  document.querySelectorAll("[data-cmw-close]").forEach((element) => {
    element.addEventListener("click", closeCmwPopup);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("cmw-popup-open")) {
      closeCmwPopup();
    }
  });
}


const body = document.body;
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelectorAll(".main-nav a");

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const isOpen = body.classList.toggle("menu-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    body.classList.remove("menu-open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
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

function initMobileMenu() {
  const menuToggle = document.querySelector(".menu-toggle")
  const nav = document.querySelector(".main-nav")

  if (!menuToggle || !nav) return

  menuToggle.addEventListener("click", () => {
    nav.classList.toggle("active")
    menuToggle.classList.toggle("active")
  })
}

initMobileMenu()