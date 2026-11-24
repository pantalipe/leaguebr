const links = [...document.querySelectorAll('.gallery-open')];
const viewer = document.querySelector('.gallery-viewer');
const image = document.querySelector('#viewer-image');
const title = document.querySelector('#viewer-title');
const status = document.querySelector('#viewer-status');
const original = document.querySelector('#viewer-original');
let current = 0;
let opener;

function showImage(index) {
  current = (index + links.length) % links.length;
  const link = links[current];
  title.textContent = link.dataset.title;
  image.alt = link.querySelector('img').alt;
  status.textContent = 'Carregando imagem…';
  image.src = link.href;
  original.href = link.href;
}

image.addEventListener('load', () => { status.textContent = `${current + 1} de ${links.length}`; });
image.addEventListener('error', () => { status.textContent = 'Não foi possível carregar a imagem. Tente abrir ou baixar o original.'; });

links.forEach((link, index) => link.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || typeof viewer.showModal !== 'function') return;
  event.preventDefault();
  opener = link;
  showImage(index);
  viewer.showModal();
}));
document.querySelector('#viewer-close').addEventListener('click', () => viewer.close());
document.querySelector('#viewer-prev').addEventListener('click', () => showImage(current - 1));
document.querySelector('#viewer-next').addEventListener('click', () => showImage(current + 1));
viewer.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showImage(current + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
viewer.addEventListener('close', () => opener?.focus());
