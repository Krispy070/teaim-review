import fs from "node:fs";
import path from "node:path";
import SFTPClient from "ssh2-sftp-client";

export type SftpLike = {
  list(dir: string): Promise<any[]>;
  get(remote: string, writable: NodeJS.WritableStream): Promise<void>;
  put(local: string, remote: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  delete(remote: string): Promise<void>;
  exists(p: string): Promise<boolean | "-" | "d">;
  mkdir(dir: string): Promise<void>;
  end(): Promise<void>;
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function localRootFor(host: string) {
  const root = path.join("/tmp/sftp", host || "local");
  ensureDir(root);
  return root;
}

export function localfs(host = "local"): SftpLike {
  const root = localRootFor(host);
  return {
    async list(dir) {
      const abs = path.join(root, dir);
      ensureDir(abs);
      const names = fs.readdirSync(abs);
      return names.map((name) => {
        const st = fs.statSync(path.join(abs, name));
        return {
          name,
          type: st.isDirectory() ? "d" : "-",
          size: st.size,
          modifyTime: st.mtimeMs,
        };
      });
    },
    async get(remote, writable) {
      const abs = path.join(root, remote);
      await new Promise<void>((resolve, reject) => {
        const rs = fs.createReadStream(abs);
        rs.on("error", reject);
        rs.on("end", resolve);
        rs.pipe(writable);
      });
    },
    async put(local, remote) {
      const abs = path.join(root, remote);
      ensureDir(path.dirname(abs));
      fs.copyFileSync(local, abs);
    },
    async rename(oldPath, newPath) {
      const from = path.join(root, oldPath);
      const to = path.join(root, newPath);
      ensureDir(path.dirname(to));
      fs.renameSync(from, to);
    },
    async delete(remote) {
      const abs = path.join(root, remote);
      fs.rmSync(abs, { force: true });
    },
    async exists(p) {
      const abs = path.join(root, p);
      if (!fs.existsSync(abs)) return false;
      const st = fs.statSync(abs);
      return st.isDirectory() ? "d" : "-";
    },
    async mkdir(dir) {
      const abs = path.join(root, dir);
      ensureDir(abs);
    },
    async end() {},
  };
}

export async function realSftp(opts: { host: string; username: string; password: string; port?: number }) {
  const c = new SFTPClient();
  await c.connect({ host: opts.host, username: opts.username, password: opts.password, port: opts.port || 22 });
  const api: SftpLike = {
    async list(dir) { return c.list(dir); },
    async get(remote, writable) {
      await c.get(remote, writable);
    },
    async put(local, remote) { await c.put(local, remote); },
    async rename(a, b) { await c.rename(a, b); },
    async delete(p) { await c.delete(p); },
    async exists(p) { return c.exists(p); },
    async mkdir(d) { await c.mkdir(d, true); },
    async end() { await c.end(); },
  };
  return api;
}

export async function getSftp(host: string, username: string, password: string, port?: number): Promise<SftpLike> {
  if (process.env.SFTP_MODE === "localfs" || host === "localfs") {
    return localfs(host === "localfs" ? "local" : host);
  }
  return realSftp({ host, username, password, port });
}
