/** Client-hosted documents (Google Drive, owner bancodmarketing@gmail.com).
 *  Kept on Drive rather than in /public so the client can replace a file without
 *  a redeploy. Every link on the site should come from here — the architectural
 *  catalogue ID was once mistyped by hand (a hyphen lost at a line break) and the
 *  button 404'd unnoticed. */

const drive = (id: string) => ({
  /** opens Drive's in-browser PDF viewer in a new tab */
  view: `https://drive.google.com/file/d/${id}/view`,
  /** starts the file download directly (confirm=t skips Drive's scan interstitial) */
  download: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
});

export const DOCS = {
  architecturalCatalogue: {
    title: 'Architectural Series Product Catalogue',
    meta: 'PDF · 42 pages · 81 MB',
    cover: '/assets/downloads/architectural-catalogue-cover.jpg',
    ...drive('1A4FOXbKyWjuNz5gYg-jERimv2CZaZTf6'),
  },
  industrialReview: {
    title: 'The Industrial Review: Banco Aluminium cover story',
    meta: 'PDF · 6 pages · 27 MB',
    cover: '/assets/downloads/industrial-review-cover.jpg',
    ...drive('1XovSbX1ltE7SBqa7oza2un9MFQBYN9jt'),
  },
} as const;
