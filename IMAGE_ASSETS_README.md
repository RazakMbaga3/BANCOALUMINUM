# Image Asset Organization Guide

## Location
All images are located in two directories within the public folder:

```
banco-website/public/assets/
├── manufacturing/    (30 images)
└── architectural/    (15 images)
```

---

## Manufacturing Process Images (30 total)

These images document Banco's manufacturing process and are used in the Process section of the homepage.

### Image Categories

| Category | Count | Files | Usage |
|----------|-------|-------|-------|
| **Billet** | 4 | Billet 1.JPG - 4.JPG | Raw material preparation |
| **Casting** | 10 | Casting 1.JPG - 10.JPG | Foundry casting operations |
| **Melting** | 6 | Melting 1.JPG - 6.JPG | Furnace and metal melting |
| **Homogenization** | 4 | Homo 1.JPG - 4.JPG | Heat treatment process |
| **Ingot** | 1 | Ingot 1.JPG | Prepared ingots |
| **Quality** | 2 | Quality 1.JPG - 2.JPG | Quality control procedures |
| **Labeling** | 1 | Labeling.png | Packing and labeling |
| **Scrap** | 2 | Scrap 1.jpeg - 2.jpeg | Recycled material handling |

### Process Section Mapping

Each step in the 8-step manufacturing process uses a representative image:

1. **Billet Casting** → `/assets/manufacturing/Billet 1.JPG`
2. **Die Design & Tooling** → `/assets/manufacturing/Casting 1.JPG`
3. **Extrusion** → `/assets/manufacturing/Melting 3.JPG`
4. **Heat Treatment** → `/assets/manufacturing/Homo 2.JPG`
5. **Machining & Fabrication** → `/assets/manufacturing/Casting 5.JPG`
6. **Cold Drawing** → `/assets/manufacturing/Ingot 1.JPG`
7. **Surface Finishing** → `/assets/manufacturing/Quality 1.JPG`
8. **Packing & Dispatch** → `/assets/manufacturing/Labeling.png`

---

## Architectural Lifestyle Images (15 total)

These images showcase modern architectural applications of Banco aluminium systems and are used in:
- Product pillar card (Architectural Systems)
- Architectural gallery showcase page
- Marketing materials

### Image Files
```
0fa274d34eaac9f8ed5881ccbca5660c.jpg
10763b613df21d191d0c3bd40ad9926a.jpg
128b984100c3b740d5f9d382a67b3de3.jpg
1c425a807b29256caece389fa7ed010f.jpg
31fb5ee618906c778bc0ed433a7b5757.jpg
41f468e4f12973012f865d065f5f3b44.jpg
45f8373ce3619411f301b794325c9ca5.jpg
5974d8840b94d09843822186b59c527e.jpg
6de0a5d9e19749b6f1e136347b188ed6.jpg
810f32deb5c2a2a7f3d0719cf87348fa.jpg
89a06dd9b7f65108e3bc376404f17998.jpg
95cdec405d6955cb06255832ff203365.jpg
9908256f57e8df7b37302e330865c1b4.jpg
9a30d7b0cacc131a0e0771ea36141d5b.jpg
f664f77f50d42d2087d86bdaced9f248.jpg
```

### Usage

**Product Pillar Page:**
- Location: `/components/sections/ProductPillars.astro`
- Image: First image (0fa274d34eaac9f8ed5881ccbca5660c.jpg)
- Size: 360px height, covers full card width
- Purpose: Show architectural aesthetic value

**Architectural Gallery Page:**
- Location: `/pages/products/architectural.astro`
- Images: All 15 images
- Grid: Responsive (280px minimum per item)
- Aspect Ratio: 1:1 square
- Purpose: Showcase modern applications

---

## Image Optimization Details

### Format & Delivery
- **Format:** JPG (original) → WebP (optimized)
- **Fallback:** JPG for older browsers
- **Quality:** Preserved through optimization
- **Size Reduction:** ~30-40% via WebP encoding

### Performance Features
1. **Lazy Loading:** All images load on-demand (loading="lazy")
2. **Responsive Sizing:** Scale to viewport
3. **Aspect Ratio:** Prevents layout shift
4. **Caching:** Optimization cached for rebuild efficiency
5. **CDN Ready:** WebP format works with Cloudflare, Vercel, Netlify

### Build Optimization
- Sharp image service configured
- Unlimited input pixels allowed
- Image cache stored: `./.astro/image`
- Static export for best performance

---

## Adding New Images

### To Add Manufacturing Images:
1. Place files in `public/assets/manufacturing/`
2. Update `src/components/sections/Process.astro` data array
3. Add `image` and `imageAlt` properties
4. Rebuild: `npm run build`

### To Add Architectural Images:
1. Place files in `public/assets/architectural/`
2. Update `architecturalImages` array in `src/pages/products/architectural.astro`
3. Rebuild: `npm run build`

---

## File Organization Best Practices

✅ **Keep organized:** Separate manufacturing from lifestyle imagery  
✅ **Use descriptive naming:** Especially for manufacturing (Category #.JPG format)  
✅ **Maintain consistency:** Use same image formats/quality across series  
✅ **Document usage:** Note which page/component uses which images  
✅ **Plan for scale:** Current structure supports 50+ images easily  

---

## Lighthouse & Performance

### Current State
- ✅ 45 images deployed
- ✅ WebP optimization active
- ✅ Lazy loading on all images
- ✅ Aspect ratios locked
- ✅ Build time: ~41 seconds

### Performance Impact
- Reduced page load time through WebP
- No layout shift (aspect ratio preservation)
- Deferred loading of below-fold images
- Optimized build cache

### Testing
To verify Lighthouse scores:
```bash
npm run build
npm run preview
# Then run Lighthouse audit on http://localhost:3000
```

---

## Maintenance Notes

- **Image Originals:** Stored in `/assets/images/` (not deployed)
- **Deployed Images:** Located in `/banco-website/public/assets/`
- **Cache:** Clear `./.astro/image` if optimization issues arise
- **Storage:** Current setup handles 100+ images efficiently

---

**Last Updated:** May 26, 2026  
**Total Images:** 45  
**Status:** Production Ready ✅
