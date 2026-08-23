/* global io */
import { state, $ } from './state.js';

/**
 * Connect Socket.io and register event handlers.
 * The server rejects unauthenticated handshakes; on failure we surface login.
 * @param {object} handlers - { onPlayerState, onTrackStart, onQueueUpdate, onPlayerDisconnect }
 */
export function initSocket(handlers) {
  if (state.socket) return;
  state.socket = io();

  state.socket.on('connect', () => console.log('[WS] Connected'));
  state.socket.on('connect_error', (err) => {
    if (err?.message === 'unauthorized') showLogin();
  });

  state.socket.on('playerState', handlers.onPlayerState);
  state.socket.on('trackStart', handlers.onTrackStart);
  state.socket.on('queueUpdate', handlers.onQueueUpdate);
  state.socket.on('playerDisconnect', handlers.onPlayerDisconnect);
}

function showLogin() {
  $('#login-screen').hidden = false;
  $('#dashboard').hidden = true;
}
