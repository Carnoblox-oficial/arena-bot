const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        headless: true
    }
});

client.on('qr', (qr) => {
    // ISSO RESOLVE O QR ESTICADO - GERA UM LINK
    const link = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`;
    console.log('=================================');
    console.log('ESCANEIA ESSE LINK NO NAVEGADOR:');
    console.log(link);
    console.log('=================================');
});

client.on('ready', () => {
    console.log('✅ BOT ARENA CONECTADO COM SUCESSO!');
});

client.on('message', async msg => {
    // ==== SEU CÓDIGO DA ARENA VEM AQUI ====
    // Mantém o que você já tinha, exemplo:
    if (msg.body.toLowerCase() === '!ping') {
        msg.reply('🏟️ Arena online!');
    }
    
    // Se você já tinha o código da arena, cola ele aqui dentro
});

client.initialize();
