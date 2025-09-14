# Meme Checker (Next.js)

Paste a meme coin contract address, get a Score, traffic-light signal, best-entry FDV (may be below current), and a single chart-validated exit target (+10%..+500%).

## Run locally
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Optional APIs
- **Birdeye API key** (candles): used for SFP/FVG/BOS/round-bottom.
- **Helius API key** or **Solana RPC URL**: used for Top-10 holders % on Solana.

Click **Settings** in the app to paste keys.

## Deploy (Vercel)
1. Push this folder to a new GitHub repo or go to https://vercel.com/new and drag-drop the folder.
2. Click **Deploy**. You’ll get a live URL like `https://your-project-name.vercel.app`.
