# GitHub Pages Deployment Fix

## Fixed Issues ✅

### 1. Asset Path Updates
All asset paths have been updated to include the `/portf/` repository prefix:

- ✅ CSS: `/portf/_astro/index.jOG576FZ.css`
- ✅ JS: `/portf/_astro/hoisted.JfNcwdsC.js`
- ✅ Favicon: `/portf/favicon.svg`
- ✅ Images: `/portf/me.png`, `/portf/me_tattoo.png`
- ✅ PDF: `/portf/CV English.pdf`
- ✅ Component URLs: `/portf/_astro/ThemeToggle.IrXc0lLY.js`, etc.

### 2. Meta Tags & URLs
- ✅ Updated canonical URL to `https://tinny-robot.github.io/portf/`
- ✅ Updated Open Graph URLs
- ✅ Updated Twitter Card URLs
- ✅ Fixed internal navigation links

### 3. Internal Links
- ✅ `/portf/index.html`
- ✅ `/portf/portfolio.htm`

## Remaining Issues ⚠️

### Missing JavaScript Files
The following JavaScript files are referenced but don't exist in the `_astro` directory:

1. `ThemeToggle.IrXc0lLY.js` - Theme toggle component
2. `client.GzREEXuT.js` - Astro client runtime
3. `TimeZoneCardV2.BI0v40zE.js` - Timezone component

### Solutions:

#### Option 1: Rebuild the Project (Recommended)
If this is an Astro project, rebuild it with the correct base path:

```bash
# If you have astro.config.mjs, add:
# base: '/portf'

npm run build
```

#### Option 2: Remove Interactive Components
If you want a purely static site, remove or simplify the interactive components:
- Remove theme toggle button
- Replace timezone card with static text
- Use static HTML/CSS only

#### Option 3: Use Root Domain
Deploy to a custom domain or use `username.github.io` (root) instead of `username.github.io/portf`:
- This way you don't need the `/portf/` prefix
- All paths can be absolute from root

## Testing Your Deployment

1. **Local Testing with Base Path:**
   ```bash
   # Serve locally with base path simulation
   python -m http.server 8000
   # Access at: http://localhost:8000/portf/index.html
   ```

2. **Check These URLs After Deploy:**
   - `https://tinny-robot.github.io/portf/` (homepage)
   - `https://tinny-robot.github.io/portf/favicon.svg` (favicon)
   - `https://tinny-robot.github.io/portf/me.png` (profile image)
   - `https://tinny-robot.github.io/portf/_astro/index.jOG576FZ.css` (CSS file)

## GitHub Pages Settings

Make sure in your repository settings (`Settings > Pages`):
- Source: Deploy from a branch
- Branch: `main` / `(root)` or `main` / `docs` depending on your setup
- If files are in root, select `/` (root)

## File Structure
```
portf/
├── index.html          ✅ Updated
├── portfolio.htm       (needs checking)
├── work.htm           (needs checking)
├── favicon.svg        ✅ 
├── me.png            ✅
├── me_tattoo.png     ✅
├── CV English.pdf    ✅
└── _astro/
    ├── index.jOG576FZ.css           ✅ Exists
    ├── hoisted.JfNcwdsC.js          ✅ Exists
    ├── ThemeToggle.IrXc0lLY.js      ❌ Missing
    ├── client.GzREEXuT.js           ❌ Missing
    └── TimeZoneCardV2.BI0v40zE.js   ❌ Missing
```

## Quick Fix for Missing JS Files

If you can't rebuild, you can comment out the interactive components in `index.html`:

```html
<!-- Comment out theme toggle -->
<!-- <astro-island uid="2wxy8F" ...></astro-island> -->

<!-- Comment out timezone card -->
<!-- <astro-island uid="Z1GCIhG" ...></astro-island> -->
```

Then manually add static replacements for these features.
