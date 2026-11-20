import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {readFile} from 'node:fs/promises';

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react({jsxImportSource:'/src/i18n'}),{
    name:'staged-english-radio-preview',apply:'serve',
    configureServer(server){server.middlewares.use('/assets/radio/en',async(req,res,next)=>{
      const file=req.url.split('?')[0].match(/^\/([a-z0-9-]+\.mp3)$/);if(!file)return next();
      try{const data=await readFile(new URL(`../qa/bilingual-radio/radio/en/${file[1]}`,import.meta.url));res.setHeader('Content-Type','audio/mpeg');res.end(data);}catch{next();}
    });},
  }],
});
