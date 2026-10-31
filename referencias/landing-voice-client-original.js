/* Live voice adapted from sonyddr666/test-chatbot, for the PICO landing only. */
(() => {
  class PicoLiveVoice {
    constructor({button, interrupt, status, partial, input, barge, onEnter, onMessage, onLog, onPlayback = () => {}, fetchImpl = fetch}) {
      Object.assign(this, {button, interruptButton: interrupt, status, partial, input, barge: barge || {checked:false, disabled:true, addEventListener(){}}, onEnter, onMessage, onLog, onPlayback, fetch: fetchImpl.bind(globalThis)});
      this.enabled = false; this.generation = 0; this.turn = 0; this.processing = false; this.speaking = false;
      this.config = {tts: 'browser', whisper: false, silenceMs: 750, stt: 'auto'};
      try {const saved = JSON.parse(window.localStorage?.getItem('pico5.voice') || 'null'); if (typeof saved?.id === 'string' && typeof saved?.name === 'string') this.selectedVoice = saved;} catch {}
      this.button.addEventListener('click', () => this.enabled || this.starting ? this.stop() : this.start());
      this.interruptButton?.addEventListener('click', () => this.interrupt());
      this.input?.addEventListener('input', () => {this.previewOwned = false;});
      this.barge.addEventListener('change', () => {if (this.speaking) {this.clearCapture(); if (this.barge.checked) this.listenWebSpeech(true);}});
      this.ready = this.loadConfig(); this.render('Microfone desligado');
      window.addEventListener('pagehide', () => this.stop());
    }
    async loadConfig() {
      try {
        const res = await this.fetch('/__landing_ai/voice/status', {credentials: 'same-origin'});
        if (!res.ok) throw new Error('Voz não disponível neste servidor.');
        this.config = await res.json(); this.configError = null;
      } catch (error) {this.configError = error;}
    }
    setVoice(id, name) {
      this.selectedVoice = {id, name};
      try {window.localStorage?.setItem('pico5.voice',JSON.stringify(this.selectedVoice));} catch {}
    }
    render(text) {
      this.status.textContent = text;
      this.button.classList.toggle('live-active', this.enabled);
      this.button.setAttribute('aria-pressed', String(this.enabled));
      this.button.setAttribute('aria-label', this.enabled ? 'Desativar microfone Live' : 'Ativar microfone Live');
      this.button.setAttribute('title', text);
      if (this.interruptButton) this.interruptButton.hidden = !this.processing && !this.speaking;
    }
    context() {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext && Context) this.audioContext = new Context();
      this.audioContext?.resume().catch(() => {}); return this.audioContext;
    }
    async start() {
      if (this.enabled || this.starting) return;
      this.starting = true; const g = ++this.generation;
      this.context(); // Unlock audio in the click gesture, including on mobile.
      this.render('Preparando Live...');
      try {
        await this.ready;
        if (this.configError) {await this.loadConfig(); if (this.configError) throw this.configError;}
        if (g !== this.generation) return;
        if (!window.isSecureContext) throw new Error('Microfone precisa de HTTPS ou localhost.');
        await this.onEnter();
        if (g !== this.generation) return;
        this.enabled = true; this.errors = 0; this.lastText = ''; this.lastSent = 0;
        this.recognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.useWhisper = this.config.stt === 'whisper' || !this.recognitionClass;
        if (this.config.stt === 'webspeech' && !this.recognitionClass) throw new Error('Abra no Chrome para usar o reconhecimento de fala direto do navegador.');
        if (this.useWhisper && !this.config.whisper) throw new Error('Este navegador precisa do Whisper. Configure a chave Groq no servidor.');
        this.barge.disabled = this.useWhisper;
        if (this.useWhisper) this.barge.checked = false;
        this.listen();
      } catch (error) {if (g === this.generation) this.stop(error.message);} finally {if (g === this.generation) this.starting = false;}
    }
    showTranscript(text) {
      this.partial.textContent = text;
      if (this.input) {
        this.input.value = text; this.lastPreview = text; this.previewOwned = true;
        this.input.scrollLeft = this.input.scrollWidth;
      }
    }
    clearTranscript() {
      this.partial.textContent = '';
      if (this.input && this.previewOwned && this.input.value === this.lastPreview) this.input.value = '';
      this.previewOwned = false; this.lastPreview = '';
    }
    clearCapture() {
      clearTimeout(this.silenceTimer); clearTimeout(this.restartTimer); clearInterval(this.vadTimer);
      if (this.recognition) {
        const rec = this.recognition; this.recognition = null;
        rec.onresult = rec.onend = rec.onerror = rec.onstart = null;
        try {rec.abort();} catch {}
      }
      if (this.recorder) {
        const rec = this.recorder; this.recorder = null; rec.onstop = rec.ondataavailable = rec.onerror = null;
        try {if (rec.state !== 'inactive') rec.stop();} catch {}
      }
      this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      try {this.mediaSource?.disconnect(); this.analyser?.disconnect();} catch {}
      this.mediaSource = this.analyser = null; this.clearTranscript();
    }
    stop(reason = 'Microfone desligado') {
      const draft = this.input?.value || '';
      this.enabled = false; this.starting = false; this.generation++;
      this.cancelTurn(); this.clearCapture(); this.render(reason);
      if (this.input && draft) this.input.value = draft;
      if (reason !== 'Microfone desligado') this.onLog(reason);
    }
    cancelTurn(keepCapture = false) {
      this.turn++; this.turnAbort?.abort(); this.turnAbort = null;
      this.stopPlayback?.(); this.stopPlayback = null;
      if (!keepCapture) this.clearCapture();
      this.processing = this.speaking = false;
      this.playbackAt = null; this.onPlayback(null);
    }
    interrupt() {
      this.cancelTurn();
      if (this.enabled) this.scheduleListen(200); else this.render('Fala interrompida');
    }
    scheduleListen(delay = 200) {
      clearTimeout(this.restartTimer);
      const g = this.generation;
      this.restartTimer = setTimeout(() => {if (this.enabled && g === this.generation && !this.processing) this.listen();}, delay);
    }
    listen() {
      if (!this.enabled || this.processing) return;
      this.clearCapture();
      if (this.useWhisper) this.listenWhisper(); else this.listenWebSpeech();
    }
    listenWebSpeech(bargeOnly = false) {
      if (!this.enabled || (bargeOnly && !this.speaking) || (this.processing && !bargeOnly) || !this.recognitionClass) return;
      this.clearCapture(); const g = this.generation;
      const rec = new this.recognitionClass(); this.recognition = rec;
      const draftPrefix = this.input?.value.trim() || '';
      rec.lang = 'pt-BR'; rec.continuous = false; rec.interimResults = true;
      let buffer = '';
      const current = () => this.enabled && g === this.generation && this.recognition === rec;
      const flush = () => {
        if (!current()) return;
        const text = buffer.trim(); buffer = ''; this.clearCapture();
        if (text) this.submit(text); else if (!this.processing) this.scheduleListen();
      };
      rec.onstart = () => {if (current() && !bargeOnly) this.render('Ouvindo · fale e faça uma pausa');};
      rec.onresult = event => {
        if (!current()) return;
        const transcript = Array.from(event.results, item => item[0].transcript).join(' ').trim();
        buffer = [draftPrefix, transcript].filter(Boolean).join(' ');
        if (bargeOnly && this.speaking && buffer.length >= 3) {
          this.cancelTurn(true); this.render('Você interrompeu · ouvindo...');
        }
        this.errors = 0; this.showTranscript(buffer);
        clearTimeout(this.silenceTimer);
        if (buffer) this.silenceTimer = setTimeout(flush, this.config.silenceMs);
      };
      rec.onend = () => {
        if (!current()) return;
        if (buffer) flush();
        else {this.recognition = null; if (!this.processing) this.scheduleListen(400); else if (bargeOnly && this.speaking) this.restartTimer = setTimeout(() => this.listenWebSpeech(true), 400);}
      };
      rec.onerror = event => {
        if (!current()) return;
        if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
          this.stop('Microfone bloqueado ou indisponível. Verifique a permissão do navegador.'); return;
        }
        if (['no-speech', 'aborted'].includes(event.error)) return;
        this.clearCapture();
        if (this.config.whisper && this.config.stt === 'auto' && !bargeOnly) {
          this.useWhisper = true; this.barge.checked = false; this.barge.disabled = true;
          this.render('Reconhecimento do navegador falhou; usando Whisper'); this.scheduleListen(600);
        } else if (++this.errors >= 3) this.stop('Reconhecimento indisponível. Você pode continuar digitando.');
        else this.scheduleListen(1500);
      };
      try {rec.start();} catch {this.stop('Não foi possível iniciar o reconhecimento de fala.');}
    }
    async listenWhisper() {
      const g = this.generation;
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Gravação não suportada neste navegador.');
        const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
        if (!this.enabled || g !== this.generation) {stream.getTracks().forEach(t => t.stop()); return;}
        this.stream = stream;
        const ctx = this.context(); if (!ctx) throw new Error('Análise de áudio indisponível.');
        const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
        const source = ctx.createMediaStreamSource(stream); source.connect(analyser);
        this.analyser = analyser; this.mediaSource = source;
        const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
        if (!mime) throw new Error('Formato de gravação não suportado.');
        const rec = new MediaRecorder(stream, {mimeType: mime}); this.recorder = rec;
        const chunks = []; let size = 0; let hasSpeech = false; let voicedMs = 0;
        const samples = new Float32Array(analyser.fftSize); const started = Date.now(); let lastVoice = started;
        rec.ondataavailable = event => {if (event.data.size) {chunks.push(event.data); size += event.data.size; if (size > 4 * 1024 * 1024) this.stop('Gravação muito grande. Tente uma frase curta.');}};
        rec.onstop = async () => {
          if (this.recorder !== rec) return;
          this.recorder = null; this.clearCapture();
          if (!this.enabled || g !== this.generation) return;
          if (!hasSpeech || voicedMs < 160 || !chunks.length) {this.scheduleListen(300); return;}
          const id = ++this.turn; const abort = new AbortController(); this.turnAbort = abort; this.processing = true; this.render('Transcrevendo sua fala...');
          try {
            const response = await this.fetch('/__landing_ai/voice/stt', {method: 'POST', credentials: 'same-origin', signal: abort.signal, headers: {'Content-Type': mime}, body: new Blob(chunks, {type: mime})});
            const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha na transcrição.');
            if (this.enabled && g === this.generation && id === this.turn) {this.processing = false; this.errors = 0; if (data.text) await this.submit(data.text); else this.scheduleListen();}
          } catch (error) {if (!abort.signal.aborted && this.enabled && id === this.turn) this.stop(error.message);}
        };
        rec.onerror = () => this.stop('Falha na gravação do microfone.');
        rec.start(250); this.render('Ouvindo · Whisper · fale e faça uma pausa');
        this.vadTimer = setInterval(() => {
          if (!this.enabled || this.recorder !== rec) return;
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
          const now = Date.now();
          if (rms > 0.018) {voicedMs += 50; hasSpeech = voicedMs >= 160; lastVoice = now;}
          if ((hasSpeech && now - lastVoice >= this.config.silenceMs) || now - started >= (hasSpeech ? 20000 : 8000)) {
            clearInterval(this.vadTimer); if (rec.state !== 'inactive') rec.stop();
          }
        }, 50);
      } catch (error) {if (g === this.generation) this.stop(error.message || 'Não foi possível acessar o microfone.');}
    }
    async submit(text, fromVoice = true) {
      if (!this.enabled || this.processing) return;
      text = text.trim().slice(0, 1200); if (!text) {this.scheduleListen(); return;}
      if (text.toLowerCase() === this.lastText && Date.now() - this.lastSent < 2200) {this.scheduleListen(); return;}
      this.lastText = text.toLowerCase(); this.lastSent = Date.now();
      this.clearCapture(); const id = ++this.turn; const abort = new AbortController(); this.turnAbort = abort;
      this.processing = true; this.render('Consultando a IA...');
      try {
        const result = await this.onMessage(text, abort.signal, fromVoice);
        if (abort.signal.aborted || !this.enabled || id !== this.turn) return;
        if (result?.reply) {
          this.playbackAt = result.at; this.onPlayback(result.at);
          await this.say(result.reply, result.at, abort.signal);
        }
      } catch (error) {
        if (!abort.signal.aborted && this.enabled && id === this.turn) {this.onLog(error.message); this.stop('Conversa pausada · clique no mic para tentar novamente');}
      } finally {
        if (id === this.turn) {
          this.processing = this.speaking = false; this.turnAbort = null; this.clearCapture();
          this.playbackAt = null; this.onPlayback(null);
          if (this.enabled) {this.render('Live ativo · preparando escuta'); this.scheduleListen(300);}
        }
      }
    }
    async toggleResponse(result) {
      if (!result?.reply || !Number.isFinite(result.at)) return;
      this.context();
      if (this.playbackAt === result.at && this.processing) {this.interrupt();return;}
      const draft = this.input?.value || '';
      this.cancelTurn(); if (this.input && draft) this.input.value = draft;
      const id = ++this.turn; const abort = new AbortController(); this.turnAbort = abort;
      this.processing = true; this.playbackAt = result.at; this.onPlayback(result.at);
      try {
        await this.ready;
        if (abort.signal.aborted) return;
        await this.say(result.reply,result.at,abort.signal,{manual:true});
      } catch (error) {if (!abort.signal.aborted) this.onLog(error.message);}
      finally {
        if (id === this.turn) {
          this.processing = this.speaking = false; this.turnAbort = null;
          this.playbackAt = null; this.onPlayback(null); this.clearCapture();
          if (this.enabled) this.scheduleListen(300); else this.render('Microfone desligado');
        }
      }
    }
    async say(text, at, signal, {manual = false} = {}) {
      this.speaking = true; this.render('Preparando voz...');
      try {
        if (this.config.tts !== 'inworld') throw new Error('browser');
        const selected = this.selectedVoice;
        const res = await this.fetch('/__landing_ai/voice/tts', {method: 'POST', credentials: 'same-origin', signal, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({at,...(selected ? {voiceId:selected.id} : {})})});
        if (!res.ok) {const data = await res.json(); throw new Error(data.error || 'Inworld indisponível.');}
        const buffer = await res.arrayBuffer(); if (signal.aborted) return;
        const ctx = this.context(); if (!ctx) throw new Error('Áudio indisponível.');
        const decoded = await ctx.decodeAudioData(buffer); if (signal.aborted) return;
        this.render(`Falando · Inworld · ${selected?.name || this.config.voice}`);
        await new Promise((resolve, reject) => {
          const source = ctx.createBufferSource(); source.buffer = decoded; source.connect(ctx.destination);
          const finish = error => {clearTimeout(timer); source.onended = null; signal.removeEventListener('abort', stop); this.stopPlayback = null; try {source.stop(); source.disconnect();} catch {} error ? reject(error) : resolve();};
          const stop = () => finish(new DOMException('Cancelado', 'AbortError'));
          const timer = setTimeout(() => finish(new Error('Reprodução demorou demais.')), Math.max(15000, decoded.duration * 1000 + 5000));
          this.stopPlayback = stop; signal.addEventListener('abort', stop, {once: true}); source.onended = () => finish(); source.start();
          if (this.barge.checked && !this.useWhisper) this.listenWebSpeech(true);
        });
      } catch (error) {
        if (signal.aborted || (!manual && !this.enabled)) return;
        if (this.config.tts === 'inworld') this.onLog(`${error.message} Usando voz do navegador.`);
        this.clearCapture(); await this.sayBrowser(text, signal);
      }
    }
    sayBrowser(text, signal) {
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) {this.onLog('Voz indisponível neste navegador. A resposta está no terminal.'); return Promise.resolve();}
      const spokenText = text.replace(/```[\s\S]*?```/g, ' Código no terminal. ')
        .replace(/[#*0-9]\uFE0F?\u20E3/gu, ' ')
        .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}]/gu, ' ')
        .replace(/[\u200D\uFE0E\uFE0F\u20E3\u{E0020}-\u{E007F}]/gu, '')
        .replace(/https?:\/\/\S+|[*_`#>]/g, ' ').replace(/\s+/g,' ').trim();
      if (!spokenText) return Promise.resolve();
      this.render('Falando · voz do navegador');
      return new Promise((resolve, reject) => {
        const utterance = new window.SpeechSynthesisUtterance(spokenText);
        utterance.lang = 'pt-BR'; utterance.rate = 1;
        utterance.voice = synth.getVoices().find(v => /^pt[-_]BR/i.test(v.lang)) || synth.getVoices().find(v => /^pt/i.test(v.lang)) || null;
        const finish = error => {clearTimeout(timer); signal.removeEventListener('abort', stop); utterance.onend = utterance.onerror = null; this.stopPlayback = null; error ? reject(error) : resolve();};
        const stop = () => {synth.cancel(); finish(new DOMException('Cancelado', 'AbortError'));};
        const timer = setTimeout(() => {synth.cancel(); finish();}, 90000);
        this.stopPlayback = stop; signal.addEventListener('abort', stop, {once: true});
        utterance.onend = () => finish(); utterance.onerror = () => finish(new Error('Falha na voz do navegador.'));
        synth.speak(utterance);
        if (this.barge.checked && !this.useWhisper) this.listenWebSpeech(true);
      });
    }
  }
  globalThis.PicoLiveVoice = PicoLiveVoice;
})();
