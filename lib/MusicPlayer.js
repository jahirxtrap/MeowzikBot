const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
  NoSubscriberBehavior,
} = require('@discordjs/voice');
const {createStream, getRelated, resolveTrack} = require('./youtube');
const store = require('./store');

const LOOP_CYCLE = {off: 'track', track: 'queue', queue: 'off'};
const ALONE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_SEEDS = 12;
const MAX_HISTORY = 60;
const MAX_PLAYED = 50;

class MusicPlayer {
  constructor(guild, client) {
    this.guild = guild;
    this.client = client;
    this.queue = [];
    this.played = [];
    this.current = null;
    this.loopMode = 'off';
    this.volume = 1;
    this.connection = null;
    this.voiceChannelId = null;
    this.currentProcess = null;
    this.skipping = false;
    this.stopping = false;
    this.shuffleMode = false;
    this.forceNext = null;
    this.advancing = false;
    this.aloneTimer = null;

    const cfg = store.getGuild(guild.id);
    this.autoplay = !!(cfg && cfg.autoplay);
    this.seeds = [];
    this.history = [];
    this.lastPlayedId = null;

    this.player = createAudioPlayer({
      behaviors: {noSubscriber: NoSubscriberBehavior.Play},
    });

    this.player.on(AudioPlayerStatus.Idle, () => this.handleTrackEnd());
    this.player.on(AudioPlayerStatus.Playing, () => {
      const t = this.current;
      console.log(
        `[player:${this.guild.id}] now playing: ${t && t.title} (requested by ${t && t.requestedBy})`,
      );
    });
    this.player.on('error', (err) => {
      console.error(`[player:${this.guild.id}] audio error:`, err.message);
      this.handleTrackEnd();
    });
  }

  connect(voiceChannel) {
    if (this.connection && this.voiceChannelId === voiceChannel.id) return;

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    this.voiceChannelId = voiceChannel.id;
    this.connection.subscribe(this.player);

    this.connection.on('error', (err) => {
      console.error(`[player:${this.guild.id}] voice connection error:`, err.message);
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.handleDisconnected();
      }
    });

    this.handleVoiceStateUpdate();
  }

  enqueue(track) {
    this.queue.push(track);
    this.addSeed(track);
    if (!this.current && !this.advancing) this.playNext();
    else this.updatePanel();
  }

  enqueueMany(tracks) {
    for (const t of tracks) {
      this.queue.push(t);
      this.addSeed(t);
    }
    if (!this.current && !this.advancing) this.playNext();
    else this.updatePanel();
  }

  takeFromQueue() {
    if (this.forceNext) {
      const t = this.forceNext;
      this.forceNext = null;
      return t;
    }
    if (!this.queue.length) return null;
    if (this.shuffleMode) {
      return this.queue.splice(Math.floor(Math.random() * this.queue.length), 1)[0];
    }
    return this.queue.shift();
  }

  async playNext() {
    if (this.advancing) return;
    this.advancing = true;
    let failed = false;
    try {
      let track = this.takeFromQueue();

      if (!track && this.autoplay && !this.stopping) {
        if (!this.inVoiceChannel()) {
          this.stopping = false;
          this.current = null;
          this.updatePanel();
          return;
        }
        const auto = await this.getAutoplayTrack();
        track = this.takeFromQueue() || auto;
      }
      this.stopping = false;

      if (!track) {
        this.current = null;
        this.updatePanel();
        return;
      }

      this.current = track;
      await this.startTrack(track);
    } catch (err) {
      console.error(`[player:${this.guild.id}] failed to play current track:`, err.message);
      this.current = null;
      failed = true;
    } finally {
      this.advancing = false;
    }
    if (failed) this.playNext();
  }

  async startTrack(track) {
    if (this.connection) {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    }

    const {stream, process} = createStream(track);
    this.currentProcess = process;
    process.on('error', () => {
    });

    const resource = createAudioResource(stream, {inputType: StreamType.Arbitrary});
    this.player.play(resource);

    if (track.id) {
      this.lastPlayedId = track.id;
      this.pushHistory(track.id);
    }
    this.updatePanel();
  }

  handleTrackEnd() {
    this.killProcess();

    if (this.current) {
      const existing = this.played.findIndex((t) => t.id === this.current.id);
      if (existing >= 0) this.played.splice(existing, 1);
      this.played.push(this.current);
      if (this.played.length > MAX_PLAYED) this.played.shift();
    }

    if (this.current && !this.skipping && !this.current.autoplay) {
      if (this.loopMode === 'track') this.queue.unshift(this.current);
      else if (this.loopMode === 'queue') this.queue.push(this.current);
    }
    this.skipping = false;
    this.current = null;
    if (!this.inVoiceChannel()) {
      this.updatePanel();
      return;
    }
    this.playNext();
  }

  async getAutoplayTrack() {
    const seedIds = [];
    if (this.lastPlayedId) seedIds.push(this.lastPlayedId);
    for (let i = this.seeds.length - 1; i >= 0; i -= 1) {
      const id = this.seeds[i].id;
      if (id && !seedIds.includes(id)) seedIds.push(id);
    }
    if (!seedIds.length) return null;

    for (const seedId of seedIds.slice(0, 5)) {
      try {
        const related = await getRelated(seedId, this.history);
        if (!related) continue;
        this.pushHistory(related.id);

        let track = await resolveTrack(related.title, 'Autoplay').catch(() => null);
        if (!track) track = related;
        track.requestedBy = 'Autoplay';
        track.autoplay = true;
        return track;
      } catch {
      }
    }
    return null;
  }

  addSeed(track) {
    if (!track || !track.id) return;
    this.seeds = this.seeds.filter((s) => s.id !== track.id);
    this.seeds.push(track);
    if (this.seeds.length > MAX_SEEDS) this.seeds.shift();
  }

  pushHistory(id) {
    this.history.push(id);
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  setAutoplay(value) {
    this.autoplay = !!value;
    store.setGuild(this.guild.id, {autoplay: this.autoplay});
    this.updatePanel();
    if (
      this.autoplay &&
      !this.current &&
      this.queue.length === 0 &&
      (this.seeds.length || this.lastPlayedId)
    ) {
      this.playNext();
    }
    return this.autoplay;
  }

  toggleAutoplay() {
    return this.setAutoplay(!this.autoplay);
  }

  inVoiceChannel() {
    const me = this.guild.members.me;
    return !!(me && me.voice && me.voice.channelId);
  }

  isPaused() {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  togglePause() {
    if (this.isPaused()) {
      this.player.unpause();
      return false;
    }
    this.player.pause();
    return true;
  }

  pause() {
    this.player.pause();
  }

  skip() {
    if (!this.current) return false;
    this.skipping = true;
    this.player.stop();
    return true;
  }

  stop() {
    this.queue = [];
    this.skipping = true;
    this.stopping = true;
    this.current = null;
    this.player.stop();
    this.killProcess();
    this.updatePanel();
  }

  shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    if (this.shuffleMode) this.shuffleQueue();
    this.updatePanel();
    return this.shuffleMode;
  }

  toggleFavorite() {
    if (!this.current) return false;
    const added = store.toggleFavorite(this.guild.id, this.current);
    this.updatePanel();
    return added;
  }

  previous() {
    if (!this.played.length) return false;
    return this.playTrackNow(this.played[this.played.length - 1]);
  }

  playTrackNow(track) {
    if (!track) return false;
    this.forceNext = track;
    if (this.current) this.skip();
    else this.playNext();
    return true;
  }

  cycleLoop() {
    this.loopMode = LOOP_CYCLE[this.loopMode];
    this.updatePanel();
    return this.loopMode;
  }

  killProcess() {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGKILL');
      } catch {
      }
      this.currentProcess = null;
    }
  }

  handleVoiceStateUpdate() {
    if (!this.connection) return;
    const me = this.guild.members.me;
    const botChannelId = me && me.voice ? me.voice.channelId : null;

    if (!botChannelId) {
      this.handleDisconnected();
      return;
    }
    if (botChannelId !== this.voiceChannelId) this.voiceChannelId = botChannelId;

    const channel = this.guild.channels.cache.get(this.voiceChannelId);
    const humans = channel ? channel.members.filter((m) => !m.user.bot).size : 0;
    if (humans === 0) this.startAloneTimer();
    else this.clearAloneTimer();
  }

  handleDisconnected() {
    if (!this.connection) return;
    this.clearAloneTimer();
    this.killProcess();
    try {
      this.player.stop();
    } catch {
    }
    try {
      this.connection.destroy();
    } catch {
    }
    this.connection = null;
    this.voiceChannelId = null;
    this.updatePanel();
  }

  startAloneTimer() {
    if (this.aloneTimer) return;
    this.aloneTimer = setTimeout(() => this.destroy(), ALONE_TIMEOUT_MS);
  }

  clearAloneTimer() {
    if (this.aloneTimer) {
      clearTimeout(this.aloneTimer);
      this.aloneTimer = null;
    }
  }

  destroy() {
    this.clearAloneTimer();
    this.queue = [];
    this.current = null;
    this.killProcess();
    try {
      this.player.stop();
    } catch {
    }
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {
      }
      this.connection = null;
    }
    this.updatePanel();
    require('./players').remove(this.guild.id);
  }

  updatePanel() {
    require('./panel')
      .refresh(this)
      .catch(() => {
      });
  }
}

module.exports = MusicPlayer;
