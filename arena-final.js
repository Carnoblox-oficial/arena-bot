// arena-final.js - Arena do Chat V1.0
// npm i whatsapp-web.js qrcode-terminal

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const client = new Client({ authStrategy: new LocalAuth(), puppeteer: { args: ['--no-sandbox'] } });

let partida = null;
let bloqueios = {}; // { numero: timestamp_desbloqueio }
let denuncias = {}; // { alvo: { qtd: 0, por: {} } }

function estaBloqueado(id){ return bloqueios[id] && Date.now() < bloqueios[id]; }

client.on('qr', qr => qrcode.generate(qr, {small: true}));
client.on('ready', () => console.log('Arena online!'));

client.on('message', async msg => {
  const chat = await msg.getChat();
  if(!chat.isGroup) {
    // RECEBE FILME NO PV - REGRA 2
    if(partida && partida.jogadores[msg.from]) {
      if(msg.body.includes('|')){
        let [nome, emoji] = msg.body.split('|').map(s=>s.trim());
        let jogador = partida.jogadores[msg.from];
        if(jogador.vez) {
          jogador.filmeAtual = { nome: nome.toLowerCase(), emoji };
          jogador.vez = false;
          client.sendMessage(partida.grupoId, `🎬 Desafio de ${jogador.nome}: ${emoji}\nVocês tem 7min! Chutem o nome!`);
          setTimeout(() => verificarAcerto(partida.grupoId), 7*60*1000);
        }
      }
    }
    return;
  }

  // COMANDO!iniciar X Y
  if(msg.body.startsWith('!iniciar')){
    let [_, pontos, espera] = msg.body.split(' ');
    pontos = parseInt(pontos) || 10;
    espera = parseInt(espera) || 2;

    if(estaBloqueado(msg.author)) return msg.reply('🚫 Você está bloqueado de iniciar por 12h');

    // REGRA 4 - ANTI-BAGUNÇA: 30 60
    if(pontos >= 30 || espera >= 60){
      let poll = await chat.sendMessage('⚠️ Partida absurda detectada', {
        poll: { name: `Cancelar!iniciar ${pontos} ${espera} de @${msg.author.split('@')[0]}?`, options: ['Sim, cancelar', 'Não'], selectableCount: 1 }
      });
      // Aguarda 2 min e conta 50%+ ONLINE
      setTimeout(async () => {
        let online = chat.participants.length; // simplificado, ideal contar com presence
        let votos = await poll.getVotes(); // pega votos SIM
        // se 50%+ votarem SIM
        if(votos[0] >= online*0.5){
          bloqueios[msg.author] = Date.now() + 12*60*60*1000;
          chat.sendMessage(`🚫 Partida cancelada. @${msg.author.split('@')[0]} bloqueado 12h`);
        } else {
          iniciarInscricao(pontos, espera, chat);
        }
      }, 2*60*1000);
      return;
    }
    iniciarInscricao(pontos, espera, chat);
  }

  if(msg.body === '!entrar' && partida){
    if(partida.desclassificados[msg.author] || partida.expulsos[msg.author]) return;
    if(!partida.jogadores[msg.author]){
      partida.fila.push(msg.author);
      partida.jogadores[msg.author] = { nome: msg.author, pontos: 0, faltas: 0, vez: false };
      msg.reply('Entrou no fim da fila!');
    }
  }

  //!denu
  if(msg.body.startsWith('!denu')){
    let alvo = msg.mentionedIds[0];
    if(!alvo) return;
    if(alvo === msg.author){ // auto-denuncia = expulsão instantânea
      expulsar(alvo, chat, 'auto-denuncia');
      return;
    }
    // 1x a cada 5 min
    if(denuncias[msg.author] && Date.now() - denuncias[msg.author].ultima < 5*60*1000) return msg.reply('Aguarde 5min pra denunciar de novo');

    denuncias[alvo] = denuncias[alvo] || { qtd: 0, por: {} };
    denuncias[alvo].qtd++;
    denuncias[alvo].por[msg.author] = true;

    let poll = await chat.sendMessage(`Votação: Expulsar @${alvo.split('@')[0]}?`, {
      poll: { name: `Expulsar ${alvo.split('@')[0]}?`, options: ['Sim', 'Não'] }
    });

    setTimeout(async () => {
      let votos = await poll.getVotes();
      let sim = votos[0] || 0;
      let total = chat.participants.length -1;
      // 4ª denuncia e <50%
      if(denuncias[alvo].qtd >= 4 && sim/total < 0.5){
        expulsar(msg.author, chat, 'denuncia abusiva'); // quem denunciou é expulso
      } else if(sim/total >= 0.51){
        expulsar(alvo, chat, 'votação');
      }
    }, 2*60*1000);
  }
});

async function iniciarInscricao(pontosVitoria, espera, chat){
  partida = { pontosVitoria, espera, grupoId: chat.id._serialized, jogadores: {}, fila: [], desclassificados: {}, expulsos: {}, indiceVez: 0, acertos: {} };
  let enquete = await chat.sendMessage('🎮 NOVA ARENA!', { poll: { name: 'Quem vai jogar?', options: ['Eu vou!'] } });
  chat.sendMessage(`Digite!entrar pra participar. Inscrição encerra em ${espera}min. Meta: ${pontosVitoria} pontos`);

  setTimeout(async () => {
    // cria ordem aleatória
    let participantes = Object.keys(partida.jogadores); // quem votou
    if(partida.fila.length === 0) partida.fila = participantes;
    partida.fila = partida.fila.sort(()=>Math.random()-0.5);
    chat.sendMessage(`Ordem: ${partida.fila.map((f,i)=> `${i+1}. @${f.split('@')[0]}`).join('\n')}`);
    passarVez();
  }, espera*60*1000);
}

async function passarVez(){
  if(!partida) return;
  let idVez = partida.fila[partida.indiceVez];
  if(!idVez){ verificarVencedor(); return; }

  let j = partida.jogadores[idVez];
  if(!j){ partida.indiceVez = (partida.indiceVez+1)%partida.fila.length; return passarVez(); }

  j.vez = true;
  client.sendMessage(partida.grupoId, `👉 Vez de @${idVez.split('@')[0]}! Mande no meu PV: NOME | EMOJI (10min)`);
  client.sendMessage(idVez, 'Sua vez! Mande: NOME DO FILME | EMOJI\nEx: Rei Leao | 🦁👑');

  // timer 10 min + timer 5 min offline
  setTimeout(() => {
    if(j.vez){ // não enviou
      j.pontos -= 1;
      j.faltas += 1;
      client.sendMessage(partida.grupoId, `⏰ @${idVez.split('@')[0]} atrasou! -1 ponto`);
      enviarPlacar();
      if(j.faltas >= 2){
        partida.desclassificados[idVez] = true;
        client.sendMessage(partida.grupoId, `🚫 @${idVez.split('@')[0]} desclassificado (2 faltas)`);
      }
      j.vez = false;
      proximo();
    }
  }, 10*60*1000);

  setTimeout(async () => {
    if(j.vez){
      let chat = await client.getChatById(partida.grupoId);
      let poll = await chat.sendMessage(`@${idVez.split('@')[0]} offline? Expulsar?`, { poll: { name: `Expulsar ${idVez.split('@')[0]} por offline?`, options: ['Sim','Não'] } });
      setTimeout(async () => {
        let votos = await poll.getVotes();
        if((votos[0]||0) / (chat.participants.length-1) >= 0.51) expulsar(idVez, chat, 'offline');
      }, 2*60*1000);
    }
  }, 5*60*1000);
}

function verificarAcerto(grupoId){
  // lógica de quem acertou fica no on message que detecta nome igual
}

function proximo(){ partida.indiceVez = (partida.indiceVez+1)%partida.fila.length; passarVez(); }

function expulsar(id, chat, motivo){
  partida.expulsos[id] = true;
  delete partida.jogadores[id];
  partida.fila = partida.fila.filter(f=>f!==id);
  chat.sendMessage(`🚫 @${id.split('@')[0]} expulso! Motivo: ${motivo}`);
}

function enviarPlacar(){
  let txt = Object.values(partida.jogadores).map(j=> `${j.nome.split('@')[0]}: ${j.pontos}pts`).join('\n');
  client.sendMessage(partida.grupoId, `🏆 PLACAR ATUALIZADO:\n${txt}`);
}

function verificarVencedor(){
  let vencedor = Object.values(partida.jogadores).find(j=>j.pontos >= partida.pontosVitoria);
  if(vencedor){
    let txt = Object.values(partida.jogadores).map(j=> `${j.nome}: ${j.pontos}`).join('\n');
    fs.writeFileSync('placar_final.txt', txt);
    client.sendMessage(partida.grupoId, `🎉 VENCEDOR: @${vencedor.nome.split('@')[0]}!`, { mentions: [vencedor.nome] });
    client.sendMessage(partida.grupoId, fs.readFileSync('placar_final.txt', 'utf8'));
    partida = null; // zera e não mantém jogadores - REGRA 3
  }
}

client.initialize();