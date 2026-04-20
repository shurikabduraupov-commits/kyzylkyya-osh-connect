# Deploy to Vercel (easy mode)

1. Push this folder to GitHub.
2. In Vercel: **Add New -> Project** and select your repository.
3. Set **Root Directory** to `artifacts/kyzylkiya-osh-rides` (if Vercel asks).
4. Build settings:
   - Build Command: `pnpm run build`
   - Output Directory: `dist`
5. In **Settings -> Environment Variables**, add:
   - `VITE_API_BASE_URL` = your backend URL (example: `https://api.example.com`)
6. Deploy.

If your backend allows CORS, the app will work right away after deploy.
