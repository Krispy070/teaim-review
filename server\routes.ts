import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { testAdminRouter } from "./admin/test";

export async function registerRoutes(app: Express): Promise<Server> {
  // Parse JSON bodies with 10MB limit
  app.use(express.json({ limit: '10mb' }));
  
  // Mount test admin router
  app.use("/admin/test", testAdminRouter);
  
  // Direct endpoints for problematic routes that need body forwarding
  app.post('/api/onboarding/start', async (req, res) => {
    try {
      console.log('[Direct] POST /onboarding/start');
      const response = await fetch('http://127.0.0.1:8000/onboarding/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers['authorization'],
          // Only forward dev headers when DEV_AUTH enabled
          ...(process.env.DEV_AUTH === '1' ? {
            'X-Dev-User': req.headers['x-dev-user'],
            'X-Dev-Org': req.headers['x-dev-org'],
            'X-Dev-Role': req.headers['x-dev-role'],
          } : {}),
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('[Direct] onboarding/start error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  app.post('/api/onboarding/respond', async (req, res) => {
    try {
      console.log('[Direct] POST /onboarding/respond');
      const response = await fetch('http://127.0.0.1:8000/onboarding/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers['authorization'],
          // Only forward dev headers when DEV_AUTH enabled
          ...(process.env.DEV_AUTH === '1' ? {
            'X-Dev-User': req.headers['x-dev-user'],
            'X-Dev-Org': req.headers['x-dev-org'],
            'X-Dev-Role': req.headers['x-dev-role'],
          } : {}),
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('[Direct] onboarding/respond error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  app.post('/api/email/inbound-dev', async (req, res) => {
    try {
      console.log('[Direct] POST /email/inbound-dev');
      const response = await fetch('http://127.0.0.1:8000/email/inbound-dev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers['authorization'],
          // Only forward dev headers when DEV_AUTH enabled
          ...(process.env.DEV_AUTH === '1' ? {
            'X-Dev-User': req.headers['x-dev-user'],
            'X-Dev-Org': req.headers['x-dev-org'],
            'X-Dev-Role': req.headers['x-dev-role'],
          } : {}),
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('[Direct] email/inbound-dev error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post('/api/onboarding/send', async (req, res) => {
    try {
      console.log('[Direct] POST /onboarding/send');
      const response = await fetch('http://127.0.0.1:8000/onboarding/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers['authorization'],
          // Only forward dev headers when DEV_AUTH enabled
          ...(process.env.DEV_AUTH === '1' ? {
            'X-Dev-User': req.headers['x-dev-user'],
            'X-Dev-Org': req.headers['x-dev-org'],
            'X-Dev-Role': req.headers['x-dev-role'],
          } : {}),
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('[Direct] onboarding/send error:', error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Mailgun webhook endpoint - use direct forward instead of broken proxy
  app.post('/api/email/mailgun', express.raw({type: '*/*', limit: '10mb'}), async (req, res) => {
    try {
      console.log('[Mailgun Direct] Forwarding webhook');
      const response = await fetch('http://127.0.0.1:8000/email/mailgun', {
        method: 'POST',
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
        },
        body: req.body
      });
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        res.status(response.status).send(text);
      }
    } catch (error: any) {
      console.error('[Mailgun Direct] Error:', error.message);
      res.status(500).json({ error: "Mailgun forward error", details: error.message });
    }
  });
  
  // Special handling for file upload endpoints (before general API forwarder)
  app.post('/api/branding/upload_*', express.raw({type: 'multipart/form-data', limit: '10mb'}), async (req, res) => {
    try {
      const path = req.path.replace('/api', ''); // /api/branding/upload_customer -> /branding/upload_customer
      const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query as any).toString() : '';
      const url = `http://127.0.0.1:8000${path}${queryString}`;
      
      console.log(`[API Forward] ${req.method} ${req.path}${queryString} (multipart) -> ${path}${queryString}`);
      
      const response = await fetch(url, {
        method: req.method,
        headers: {
          // Preserve original Content-Type for multipart data
          'Content-Type': req.headers['content-type'],
          'User-Agent': req.headers['user-agent'] || 'Express-Forwarder',
          'Authorization': req.headers['authorization'],
          // Only forward dev headers when DEV_AUTH enabled
          ...(process.env.DEV_AUTH === '1' ? {
            'X-Dev-User': req.headers['x-dev-user'],
            'X-Dev-Org': req.headers['x-dev-org'],
            'X-Dev-Role': req.headers['x-dev-role'],
          } : {}),
        } as any,
        body: req.body, // Forward raw body for multipart data
        timeout: 30000
      });
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        console.log(`[API Forward] Response ${response.status} for ${req.method} ${req.path}`);
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        console.log(`[API Forward] Response ${response.status} for ${req.method} ${req.path}`);
        res.status(response.status).send(text);
      }
    } catch (error: any) {
      console.error(`[API Forward] Error for ${req.method} ${req.path}:`, error.message);
      res.status(500).json({ error: "API forward error", details: error.message });
    }
  });

  // Direct forwarder for all API calls (replacing broken proxy)
  app.all('/api/*', express.json({limit: '10mb'}), async (req, res) => {
    try {
      const path = req.path.replace('/api', ''); // /api/ask -> /ask
      const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query as any).toString() : '';
      const url = `http://127.0.0.1:8000${path}${queryString}`;
      
      console.log(`[API Forward] ${req.method} ${req.path}${queryString} -> ${path}${queryString}`);
      
      const response = await fetch(url, {
        method: req.method,
        headers: {
          // Only forward specific headers for security
          'Content-Type': req.headers['content-type'] || 'application/json',
          'User-Agent': req.headers['user-agent'] || 'Express-Forwarder',
          'Authorization': req.headers['authorization'],
          // Only forward dev headers when DEV_AUTH enabled
          ...(process.env.DEV_AUTH === '1' ? {
            'X-Dev-User': req.headers['x-dev-user'],
            'X-Dev-Org': req.headers['x-dev-org'],
            'X-Dev-Role': req.headers['x-dev-role'],
          } : {}),
        } as any,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
        timeout: 30000
      });
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        console.log(`[API Forward] Response ${response.status} for ${req.method} ${req.path}`);
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        console.log(`[API Forward] Response ${response.status} for ${req.method} ${req.path}`);
        res.status(response.status).send(text);
      }
    } catch (error: any) {
      console.error(`[API Forward] Error for ${req.method} ${req.path}:`, error.message);
      res.status(500).json({ error: "API forward error", details: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}