/* @ds-bundle: {"format":4,"namespace":"BndClassroom","components":[{"name":"Button"},{"name":"Badge"},{"name":"StatePill"},{"name":"SectionLabel"},{"name":"Card"},{"name":"Rule"},{"name":"Icon"},{"name":"SessionStatus"},{"name":"SignalMeter"},{"name":"BroadcastStage"},{"name":"ParticipantTile"},{"name":"MediaControls"},{"name":"AttendanceList"},{"name":"DiscussionMessage"},{"name":"TransportBadge"},{"name":"LatencyReadout"},{"name":"UtilizationLadder"},{"name":"RelayPath"},{"name":"TrackCatalog"},{"name":"ChannelCard"},{"name":"FeedItem"},{"name":"LiveFeed"},{"name":"StatTile"},{"name":"TrustLabel"},{"name":"BroadcasterCard"},{"name":"WorldAudience"},{"name":"PresenceTimeline"},{"name":"ContentUse"},{"name":"AgentActivity"}]} */
(function () {
  var React = window.React, h = React.createElement;
  var ICONS = {"activity":[["path",{"d":"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]],"antenna":[["path",{"d":"M2 12 7 2"}],["path",{"d":"m7 12 5-10"}],["path",{"d":"m12 12 5-10"}],["path",{"d":"m17 12 5-10"}],["path",{"d":"M4.5 7h15"}],["path",{"d":"M12 16v6"}]],"badge-check":[["path",{"d":"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"}],["path",{"d":"m9 12 2 2 4-4"}]],"book-open":[["path",{"d":"M12 7v14"}],["path",{"d":"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"}]],"bot":[["path",{"d":"M12 8V4H8"}],["rect",{"width":"16","height":"12","x":"4","y":"8","rx":"2"}],["path",{"d":"M2 14h2"}],["path",{"d":"M20 14h2"}],["path",{"d":"M15 13v2"}],["path",{"d":"M9 13v2"}]],"circle-dot":[["circle",{"cx":"12","cy":"12","r":"10"}],["circle",{"cx":"12","cy":"12","r":"1"}]],"eye":[["path",{"d":"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{"cx":"12","cy":"12","r":"3"}]],"file-search":[["path",{"d":"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{"d":"M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"}],["path",{"d":"m9 18-1.5-1.5"}],["circle",{"cx":"5","cy":"14","r":"3"}]],"globe":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"}],["path",{"d":"M2 12h20"}]],"hand":[["path",{"d":"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"}],["path",{"d":"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"}],["path",{"d":"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"}],["path",{"d":"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"}]],"message-circle":[["path",{"d":"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],"mic-off":[["line",{"x1":"2","x2":"22","y1":"2","y2":"22"}],["path",{"d":"M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"}],["path",{"d":"M5 10v2a7 7 0 0 0 12 5"}],["path",{"d":"M15 9.34V5a3 3 0 0 0-5.68-1.33"}],["path",{"d":"M9 9v3a3 3 0 0 0 5.12 2.12"}],["line",{"x1":"12","x2":"12","y1":"19","y2":"22"}]],"mic":[["path",{"d":"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"}],["path",{"d":"M19 10v2a7 7 0 0 1-14 0v-2"}],["line",{"x1":"12","x2":"12","y1":"19","y2":"22"}]],"monitor-up":[["path",{"d":"m9 10 3-3 3 3"}],["path",{"d":"M12 13V7"}],["rect",{"width":"20","height":"14","x":"2","y":"3","rx":"2"}],["path",{"d":"M12 17v4"}],["path",{"d":"M8 21h8"}]],"pen-line":[["path",{"d":"M12 20h9"}],["path",{"d":"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"}]],"phone-off":[["path",{"d":"M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"}],["line",{"x1":"22","x2":"2","y1":"2","y2":"22"}]],"radar":[["path",{"d":"M19.07 4.93A10 10 0 0 0 6.99 3.34"}],["path",{"d":"M4 6h.01"}],["path",{"d":"M2.29 9.62A10 10 0 1 0 21.31 8.35"}],["path",{"d":"M16.24 7.76A6 6 0 1 0 8.23 16.67"}],["path",{"d":"M12 18h.01"}],["path",{"d":"M17.99 11.66A6 6 0 0 1 15.77 16.67"}],["circle",{"cx":"12","cy":"12","r":"2"}],["path",{"d":"m13.41 10.59 5.66-5.66"}]],"radio":[["path",{"d":"M4.9 19.1C1 15.2 1 8.8 4.9 4.9"}],["path",{"d":"M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"}],["circle",{"cx":"12","cy":"12","r":"2"}],["path",{"d":"M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"}],["path",{"d":"M19.1 4.9C23 8.8 23 15.1 19.1 19"}]],"rss":[["path",{"d":"M4 11a9 9 0 0 1 9 9"}],["path",{"d":"M4 4a16 16 0 0 1 16 16"}],["circle",{"cx":"5","cy":"19","r":"1"}]],"search-check":[["path",{"d":"m8 11 2 2 4-4"}],["circle",{"cx":"11","cy":"11","r":"8"}],["path",{"d":"m21 21-4.3-4.3"}]],"share-2":[["circle",{"cx":"18","cy":"5","r":"3"}],["circle",{"cx":"6","cy":"12","r":"3"}],["circle",{"cx":"18","cy":"19","r":"3"}],["line",{"x1":"8.59","x2":"15.42","y1":"13.51","y2":"17.49"}],["line",{"x1":"15.41","x2":"8.59","y1":"6.51","y2":"10.49"}]],"shield-check":[["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"m9 12 2 2 4-4"}]],"signal":[["path",{"d":"M2 20h.01"}],["path",{"d":"M7 20v-4"}],["path",{"d":"M12 20v-8"}],["path",{"d":"M17 20V8"}],["path",{"d":"M22 4v16"}]],"triangle-alert":[["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{"d":"M12 9v4"}],["path",{"d":"M12 17h.01"}]],"tv-minimal":[["path",{"d":"M7 21h10"}],["rect",{"width":"20","height":"14","x":"2","y":"3","rx":"2"}]],"undo-2":[["path",{"d":"M9 14 4 9l5-5"}],["path",{"d":"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"}]],"user-round":[["circle",{"cx":"12","cy":"8","r":"5"}],["path",{"d":"M20 21a8 8 0 0 0-16 0"}]],"users":[["path",{"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"}],["circle",{"cx":"9","cy":"7","r":"4"}],["path",{"d":"M22 21v-2a4 4 0 0 0-3-3.87"}],["path",{"d":"M16 3.13a4 4 0 0 1 0 7.75"}]],"video-off":[["path",{"d":"M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196"}],["path",{"d":"M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"}],["path",{"d":"m2 2 20 20"}]],"video":[["path",{"d":"m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"}],["rect",{"x":"2","y":"6","width":"14","height":"12","rx":"2"}]],"waypoints":[["circle",{"cx":"12","cy":"4.5","r":"2.5"}],["path",{"d":"m10.2 6.3-3.9 3.9"}],["circle",{"cx":"4.5","cy":"12","r":"2.5"}],["path",{"d":"M7 12h10"}],["circle",{"cx":"19.5","cy":"12","r":"2.5"}],["path",{"d":"m13.8 17.7 3.9-3.9"}],["circle",{"cx":"12","cy":"19.5","r":"2.5"}]],"wifi-off":[["path",{"d":"M12 20h.01"}],["path",{"d":"M8.5 16.429a5 5 0 0 1 7 0"}],["path",{"d":"M5 12.859a10 10 0 0 1 5.17-2.69"}],["path",{"d":"M19 12.859a10 10 0 0 0-2.007-1.523"}],["path",{"d":"M2 8.82a15 15 0 0 1 4.177-2.643"}],["path",{"d":"M22 8.82a15 15 0 0 0-11.288-3.764"}],["path",{"d":"m2 2 20 20"}]]};
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }

  function Icon(p) {
    var nodes = ICONS[p.name] || [];
    return h('svg', { className: cx('bc-icon', p.className), width: p.size || 20, height: p.size || 20, viewBox: '0 0 24 24',
      fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false' },
      nodes.map(function (n, i) {
        var a = { key: i };
        for (var k in n[1]) a[k.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = n[1][k];
        return h(n[0], a);
      }));
  }

  var Button = React.forwardRef(function Button(p, ref) {
    var variant = p.variant || 'primary', size = p.size || 'md';
    var rest = Object.assign({}, p); delete rest.variant; delete rest.size; delete rest.className; delete rest.icon; delete rest.href;
    var cls = cx('bc-btn', 'bc-btn-' + variant, 'bc-btn-' + size, p.className);
    var kids = [p.icon ? h(Icon, { key: 'i', name: p.icon, size: 18 }) : null, p.children];
    if (p.href) return h('a', Object.assign({ ref: ref, href: p.href, className: cls }, rest), kids);
    return h('button', Object.assign({ ref: ref, type: 'button', className: cls }, rest), kids);
  });

  function Badge(p) {
    return h('span', { className: cx('bc-badge', 'bc-tone-' + (p.tone || 'neutral'), p.className) }, p.children);
  }

  var STATE_TONE = { observed: 'neutral', 'user-provided': 'red', inferred: 'amber', proposed: 'neutral', approved: 'red',
    executed: 'amber', verified: 'green', failed: 'red', unavailable: 'neutral', pending: 'amber', 'not-connected': 'neutral',
    connected: 'green', syncing: 'red', healthy: 'green', degraded: 'amber', error: 'red', blocked: 'red', idle: 'neutral', active: 'red' };
  function StatePill(p) {
    var tone = STATE_TONE[p.state] || 'neutral';
    return h('span', { className: cx('bc-pill', 'bc-tone-' + tone, p.className) },
      h('span', { className: 'bc-dot bc-dot-' + tone, 'aria-hidden': 'true' }), String(p.state || '—').replace(/_/g, ' '));
  }

  function SectionLabel(p) {
    return h('p', { className: cx('bc-kicker', p.className) }, p.icon ? h(Icon, { name: p.icon, size: 14 }) : null, p.children);
  }

  function Card(p) {
    var rest = Object.assign({}, p); delete rest.className; delete rest.padding;
    return h('div', Object.assign({ className: cx('bc-card', p.padding === 'lg' ? 'bc-pad-6' : 'bc-pad-5', p.className) }, rest));
  }

  function Rule(p) {
    return h('hr', { 'aria-hidden': 'true', className: cx('bc-rule', p.double ? 'bc-rule-double' : p.thick ? 'bc-rule-thick' : 'bc-rule-thin', p.className) });
  }

  var STATUS = { scheduled: ['Scheduled', 'neutral'], live: ['Live lesson', 'live'], ended: ['Ended', 'neutral'] };
  function SessionStatus(p) {
    var s = STATUS[p.status] || STATUS.scheduled;
    return h('span', { className: cx('bc-session', 'bc-session-' + (p.status || 'scheduled'), p.onStage ? 'bc-on-stage' : null, p.className) },
      p.status === 'live' ? h('span', { className: 'bc-dot bc-dot-live', 'aria-hidden': 'true' }) : null, p.label || s[0]);
  }

  // Measured receive state. Never derive "receiving" from an HTTP status: pass packets from inbound-rtp.
  var SIGNAL = {
    'not-configured': [0, 'Broadcast not configured', 'muted'],
    'not-connected': [0, 'Not connected', 'muted'],
    measuring: [1, 'Measuring', 'caution'],
    silent: [1, 'Connected · no frames', 'caution'],
    weak: [2, 'Weak signal', 'caution'],
    receiving: [4, 'Receiving', 'ok'],
    interrupted: [0, 'Connection interrupted', 'live'],
  };
  function SignalMeter(p) {
    var s = SIGNAL[p.state] || SIGNAL['not-connected'];
    var bars = []; for (var i = 1; i <= 4; i++) bars.push(h('span', { key: i, className: cx('bc-bar', i <= s[0] ? 'bc-bar-on' : null), style: { height: (4 + i * 3) + 'px' } }));
    return h('span', { role: 'status', className: cx('bc-signal', 'bc-signal-' + s[2], p.onStage ? 'bc-on-stage' : null, p.className) },
      h('span', { className: 'bc-bars', 'aria-hidden': 'true' }, bars),
      h('span', { className: 'bc-signal-word' }, p.label || s[1]),
      p.packets != null ? h('span', { className: 'bc-evidence' }, Number(p.packets).toLocaleString() + ' ' + (p.unit || 'packets')) : null);
  }

  function Initials(name) { return String(name || '?').split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); }

  function ParticipantTile(p) {
    var muted = p.mic === 'off';
    return h('figure', { className: cx('bc-tile', p.speaking && !muted ? 'bc-speaking' : null, p.className), 'aria-label': p.name + (p.isHost ? ', host' : '') + (muted ? ', microphone off' : p.speaking ? ', speaking' : '') },
      h('div', { className: 'bc-tile-media' }, p.children || h('span', { className: 'bc-initials', 'aria-hidden': 'true' }, Initials(p.name))),
      h('figcaption', { className: 'bc-caption' },
        h('span', { className: 'bc-caption-name' }, p.name, p.own ? ' (you)' : ''),
        p.isHost ? h('span', { className: 'bc-host-tag' }, 'Host') : null,
        h('span', { className: cx('bc-mic', muted ? 'bc-mic-off' : p.speaking ? 'bc-mic-live' : null) }, h(Icon, { name: muted ? 'mic-off' : 'mic', size: 14 }),
          h('span', { className: 'bc-sr' }, muted ? 'Microphone off' : p.speaking ? 'Speaking' : 'Microphone on'))));
  }

  var EMPTY = {
    scheduled: ['radio', 'Waiting for the host to start.', 'The stage opens when the host starts the lesson session.'],
    'camera-off': ['video-off', 'The host camera is off.', 'Audio and the shared lesson continue.'],
    silent: ['wifi-off', 'Connected, but no frames are arriving.', 'The room is not shown as live until packets are measured.'],
    'not-configured': ['radio', 'Broadcast is not enabled for this workspace.', 'Classes use shared lessons and text discussion.'],
    ended: ['circle-dot', 'This class has ended.', 'The lesson and discussion remain available.'],
    agents: ['bot', 'No one is on air.', 'Agents are working on this channel\u2019s content. Their changes wait for review.'],
  };
  function BroadcastStage(p) {
    var live = p.status === 'live' && !p.empty;
    var e = EMPTY[p.empty || p.status] || EMPTY.scheduled;
    return h('section', { className: cx('bc-stage', p.className), 'aria-label': 'Broadcast stage' },
      h('div', { className: 'bc-stage-media' }, live ? (p.children || h('span', { className: 'bc-initials bc-initials-lg', 'aria-hidden': 'true' }, Initials(p.hostName))) :
        h('div', { className: 'bc-stage-empty' }, h(Icon, { name: e[0], size: 28 }), h('p', { className: 'bc-stage-empty-title' }, e[1]),
          h('p', { className: 'bc-stage-empty-text' }, p.empty === 'agents' && typeof p.agents === 'number' ? p.agents + (p.agents === 1 ? ' agent is' : ' agents are') + ' working on this channel\u2019s content. Their changes wait for review.' : e[2]))),
      h('div', { className: 'bc-stage-top' }, h(SessionStatus, { status: p.status, onStage: true }), p.signal ? h(SignalMeter, { state: p.signal, packets: p.packets, onStage: true }) : null),
      live && p.hostName ? h('div', { className: 'bc-stage-plate' }, h('span', { className: 'bc-caption-name' }, p.hostName), h('span', { className: 'bc-host-tag' }, 'Host'), p.section ? h('span', { className: 'bc-plate-meta' }, p.section) : null) : null);
  }

  function Toggle(p) {
    return h('button', { type: 'button', className: cx('bc-media-btn', p.on ? 'bc-media-on' : 'bc-media-off', p.danger ? 'bc-media-danger' : null), 'aria-pressed': p.danger ? undefined : !!p.on, disabled: p.disabled, onClick: p.onClick },
      h(Icon, { name: p.icon, size: 20 }), h('span', null, p.label));
  }
  function MediaControls(p) {
    var canPublish = !!p.canPublish, f = p.onToggle || function () {};
    return h('div', { role: 'toolbar', 'aria-label': 'Classroom media', className: cx('bc-controls', p.className) },
      canPublish ? [
        h(Toggle, { key: 'm', icon: p.mic ? 'mic' : 'mic-off', on: p.mic, label: p.mic ? 'Mute' : 'Unmute', onClick: function () { f('mic'); }, disabled: p.disabled }),
        h(Toggle, { key: 'c', icon: p.camera ? 'video' : 'video-off', on: p.camera, label: p.camera ? 'Stop camera' : 'Start camera', onClick: function () { f('camera'); }, disabled: p.disabled }),
        h(Toggle, { key: 's', icon: 'monitor-up', on: p.sharing, label: p.sharing ? 'Stop sharing' : 'Share screen', onClick: function () { f('share'); }, disabled: p.disabled }),
      ] : [
        h('span', { key: 'n', className: 'bc-listen-note' }, h(Icon, { name: 'radio', size: 16 }), 'Listening. The host broadcasts.'),
        h(Toggle, { key: 'h', icon: 'hand', on: p.hand, label: p.hand ? 'Lower hand' : 'Raise hand', onClick: function () { f('hand'); }, disabled: p.disabled }),
      ],
      h('span', { className: 'bc-controls-gap' }),
      h(Toggle, { icon: 'phone-off', danger: true, label: canPublish && p.isHost ? 'End broadcast' : 'Leave class', onClick: function () { f('leave'); }, disabled: p.disabled }));
  }

  function AttendanceList(p) {
    var people = p.participants || [];
    return h(Card, { className: 'bc-stack-3' },
      h('h2', { className: 'bc-h-xl bc-with-icon' }, h(Icon, { name: 'users', size: 20 }), p.live ? 'Attending (' + people.length + ')' : 'Attendance'),
      p.live ? [h('ul', { key: 'l', className: 'bc-attend' }, people.map(function (x) {
        return h('li', { key: x.id || x.name }, h('span', null, x.name, x.isHost ? ' · Host' : ''), x.hand ? h(Badge, { tone: 'amber' }, 'Hand raised') : null);
      })), h('p', { key: 'n', className: 'bc-caption-text' }, people.length ? 'Attendance expires when a member disconnects or closes this room.' : 'No members are currently attending.')]
        : h('p', { className: 'bc-muted' }, 'Attendance is shown while the session and your connection are live.'));
  }

  function DiscussionMessage(p) {
    return h('li', { className: 'bc-message' },
      h('p', { className: 'bc-message-meta' }, h('span', null, p.name, p.own ? ' (you)' : ''), h('time', null, p.time)),
      h('p', { className: 'bc-message-body' }, p.body));
  }


  // ── Feed and broadcast platform ───────────────────────────────────────
  var LEVELS = ['EXISTS', 'CONFIGURED', 'CONNECTED', 'USED', 'VERIFIED', 'REPEATED'];
  function levelIndex(l) { return LEVELS.indexOf(String(l || '').toUpperCase()); }

  // SFU is the primary transport; MoQ is experimental and non-critical.
  function TransportBadge(p) {
    var moq = p.transport === 'moq';
    var lvl = p.level ? String(p.level).toUpperCase() : 'UNMEASURED';
    var reached = levelIndex(lvl) >= levelIndex('USED');
    return h('span', { className: cx('bc-transport', moq ? 'bc-transport-moq' : 'bc-transport-sfu', p.onStage ? 'bc-on-stage' : null, p.className) },
      h(Icon, { name: moq ? 'antenna' : 'radio', size: 14 }),
      h('span', { className: 'bc-transport-name' }, moq ? 'MoQ' : 'SFU'),
      moq ? h('span', { className: 'bc-transport-exp' }, 'Experimental') : null,
      h('span', { className: cx('bc-evidence', reached ? null : 'bc-unmeasured') }, lvl));
  }

  function LatencyReadout(p) {
    var measured = typeof p.ms === 'number' && isFinite(p.ms);
    var over = measured && p.targetMs && p.ms > p.targetMs;
    return h('span', { className: cx('bc-latency', over ? 'bc-latency-over' : null, p.onStage ? 'bc-on-stage' : null, p.className) },
      h(Icon, { name: 'activity', size: 14 }),
      h('span', { className: 'bc-latency-label' }, p.label || 'Latency'),
      measured ? h('span', { className: 'bc-latency-value' }, Math.round(p.ms) + ' ms') : h('span', { className: 'bc-unmeasured' }, 'Unmeasured'),
      measured && p.targetMs ? h('span', { className: 'bc-evidence' }, (over ? 'over ' : 'within ') + p.targetMs + ' ms target') : null,
      p.source ? h('span', { className: 'bc-evidence' }, 'src: ' + p.source) : null);
  }

  function UtilizationLadder(p) {
    var items = p.items || [];
    return h(Card, { className: 'bc-stack-3' },
      h('div', null, h('h3', { className: 'bc-h-lg' }, p.title || 'Runtime utilization'), h('p', { className: 'bc-muted' }, 'Presence is not usage. Usage is not verification.')),
      h('div', { className: 'bc-scroll' }, h('table', { className: 'bc-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Capability'), LEVELS.map(function (l) { return h('th', { key: l, scope: 'col', className: 'bc-th-level' }, l); }), h('th', { scope: 'col' }, 'Evidence'))),
        h('tbody', null, items.map(function (it) {
          return h('tr', { key: it.id || it.title }, h('th', { scope: 'row' }, it.title),
            LEVELS.map(function (l) { var on = (it.levels || []).indexOf(l) >= 0; return h('td', { key: l, className: cx('bc-td-level', on ? 'bc-level-on' : null) }, h('span', { 'aria-hidden': 'true' }, on ? '●' : '—'), h('span', { className: 'bc-sr' }, on ? 'reached' : 'not reached')); }),
            h('td', { className: cx('bc-evidence', it.evidence ? null : 'bc-unmeasured') }, it.evidence || 'UNMEASURED'));
        })))));
  }

  var HOP_ICON = { publisher: 'radio', relay: 'antenna', subscribers: 'users' };
  function RelayPath(p) {
    var hops = p.hops || [];
    return h('ol', { className: cx('bc-relay', p.className), 'aria-label': p.label || 'Broadcast path' }, hops.map(function (x, i) {
      var st = x.state || 'unmeasured';
      return h('li', { key: i, className: cx('bc-hop', 'bc-hop-' + st) },
        i > 0 ? h('span', { className: 'bc-hop-link', 'aria-hidden': 'true' }) : null,
        h('span', { className: 'bc-hop-body' },
          h('span', { className: 'bc-hop-head' }, h(Icon, { name: HOP_ICON[x.role] || 'waypoints', size: 16 }), h('span', { className: 'bc-hop-name' }, x.name)),
          h('span', { className: 'bc-hop-role' }, x.role === 'subscribers' ? (x.count != null ? x.count + ' subscribers' : 'Subscribers') : x.role === 'relay' ? 'Relay' : 'Publisher'),
          h('span', { className: cx('bc-evidence', st === 'measured' ? null : 'bc-unmeasured') },
            st === 'down' ? 'Unreachable' : typeof x.latencyMs === 'number' ? '+' + x.latencyMs + ' ms' : 'UNMEASURED')));
    }));
  }

  var TRACK_STATE = { receiving: ['Receiving', 'green'], stalled: ['Stalled', 'amber'], idle: ['Not subscribed', 'neutral'], ended: ['Ended', 'neutral'] };
  var KIND_ICON = { video: 'video', audio: 'mic', captions: 'message-circle', feed: 'rss', slides: 'book-open' };
  function TrackCatalog(p) {
    var tracks = p.tracks || [], f = p.onToggle || function () {};
    return h(Card, { className: 'bc-stack-3' },
      h('div', { className: 'bc-row-between' }, h('h3', { className: 'bc-h-lg bc-with-icon' }, h(Icon, { name: 'antenna', size: 18 }), 'Tracks'), p.namespace ? h('span', { className: 'bc-evidence bc-muted-ink' }, p.namespace) : null),
      h('ul', { className: 'bc-tracks' }, tracks.map(function (t) {
        var s = TRACK_STATE[t.state] || TRACK_STATE.idle, id = 'trk-' + String(t.name).replace(/[^a-z0-9]/gi, '-');
        return h('li', { key: t.name, className: 'bc-track' },
          h('input', { type: 'checkbox', id: id, checked: !!t.subscribed, disabled: p.disabled || t.state === 'ended', onChange: function () { f(t.name); } }),
          h('label', { htmlFor: id, className: 'bc-track-name' }, h(Icon, { name: KIND_ICON[t.kind] || 'waypoints', size: 16 }), h('span', null, t.label || t.name), t.rendition ? h('span', { className: 'bc-evidence bc-muted-ink' }, t.rendition) : null),
          h('span', { className: cx('bc-pill', 'bc-tone-' + s[1], 'bc-track-pill') }, h('span', { className: 'bc-dot bc-dot-' + s[1], 'aria-hidden': 'true' }), s[0]),
          h('span', { className: 'bc-evidence bc-muted-ink bc-track-seq' }, t.group != null ? 'g' + t.group + ' · o' + (t.object || 0) : '—'));
      })),
      h('p', { className: 'bc-caption-text' }, p.note || 'Subscribe to what you need. Audio and captions keep the class working when video is dropped.'));
  }

  function ChannelCard(p) {
    var viewers = typeof p.viewers === 'number' ? p.viewers.toLocaleString() + ' watching' : 'Audience unmeasured';
    return h('article', { className: cx('bc-card bc-pad-5 bc-channel', p.className) },
      h('div', { className: 'bc-row-between' }, h(SessionStatus, { status: p.status, label: p.status === 'live' ? 'On air' : undefined }), h(TransportBadge, { transport: p.transport, level: p.level })),
      h('h3', { className: 'bc-h-xl' }, p.href ? h('a', { href: p.href, className: 'bc-link-cover' }, p.title) : p.title),
      p.summary ? h('p', { className: 'bc-muted bc-clamp' }, p.summary) : null,
      h('p', { className: 'bc-channel-meta' }, h('span', null, 'Hosted by ' + p.host), h('span', null, p.status === 'live' ? viewers : p.when || '')));
  }

  // Sentinel feed. Kinds stay distinct; missing confidence is unknown, never zero.
  var KIND = {
    observation: ['Observation', 'neutral', 'radar'],
    inferred: ['Inferred', 'amber', 'activity'],
    judgment: ['Analyst judgment', 'red', 'shield-check'],
    broadcast: ['Broadcast', 'red', 'tv-minimal'],
    post: ['Post', 'neutral', 'message-circle'],
    correction: ['Correction', 'amber', 'undo-2'],
  };
  var CUE_STATUS = { OPEN: 'Open', UNDER_REVIEW: 'Under review', DISPOSITIONED: 'Dispositioned', RETRACTED: 'Retracted' };
  var PRIORITY = { high: ['High priority', 'red'], medium: ['Medium priority', 'amber'], low: ['Low priority', 'neutral'] };
  function FeedItem(p) {
    var k = KIND[p.kind] || KIND.post, retracted = p.status === 'RETRACTED';
    var conf = p.confidence && typeof p.confidence.value === 'number'
      ? 'Confidence ' + p.confidence.value + (p.confidence.scale ? ' / ' + p.confidence.scale : '') + (p.confidence.method ? ' · ' + p.confidence.method : '')
      : 'Confidence unknown';
    return h('li', { className: cx('bc-feed-item', retracted ? 'bc-retracted' : null, p.unread ? 'bc-unread' : null) },
      h('div', { className: 'bc-feed-head' },
        h('span', { className: cx('bc-feed-kind', 'bc-kind-' + k[1]) }, h(Icon, { name: k[2], size: 14 }), k[0]),
        p.priority && PRIORITY[p.priority] ? h(Badge, { tone: PRIORITY[p.priority][1] }, PRIORITY[p.priority][0]) : null,
        p.status ? h('span', { className: 'bc-feed-status' }, CUE_STATUS[p.status] || p.status) : null,
        h('time', { className: 'bc-feed-time', dateTime: p.datetime }, p.time)),
      h('h4', { className: 'bc-feed-title' }, p.href ? h('a', { href: p.href }, p.title) : p.title),
      p.body ? h('p', { className: 'bc-feed-body' }, p.body) : null,
      p.correction ? h('p', { className: 'bc-feed-correction' }, h(Icon, { name: 'undo-2', size: 14 }), p.correction) : null,
      h('p', { className: 'bc-feed-meta' },
        h('span', null, 'src: ' + (p.source || 'not supplied')),
        p.kind === 'observation' || p.kind === 'inferred' || p.kind === 'judgment' ? h('span', { className: p.confidence ? null : 'bc-unmeasured' }, conf) : null,
        h('span', null, h(Icon, { name: 'file-search', size: 12 }), ' ' + (p.evidence || 0) + ' evidence')));
  }

  var FEED_STATE = { live: ['connected', 'Live'], paused: ['pending', 'Paused'], 'not-connected': ['not-connected', 'Not connected'], degraded: ['degraded', 'Delayed'] };
  function LiveFeed(p) {
    var st = FEED_STATE[p.state] || FEED_STATE['not-connected'], items = p.items || [];
    return h('section', { className: cx('bc-card bc-feed', p.className), 'aria-labelledby': 'bc-feed-title' },
      h('header', { className: 'bc-feed-header' },
        h('div', null, h('p', { className: 'bc-kicker' }, h(Icon, { name: 'radar', size: 14 }), p.kicker || 'Sentinel'), h('h2', { id: 'bc-feed-title', className: 'bc-h-xl' }, p.title || 'Feed')),
        h('div', { className: 'bc-feed-tools' }, h(StatePill, { state: st[0] }), h('span', { className: 'bc-sr' }, st[1]),
          p.onPause && p.state !== 'not-connected' ? h(Button, { variant: 'secondary', size: 'sm', onClick: p.onPause }, p.state === 'paused' ? 'Resume' : 'Pause') : null)),
      p.newCount ? h('button', { type: 'button', className: 'bc-feed-new', onClick: p.onShowNew }, 'Show ' + p.newCount + ' new ' + (p.newCount === 1 ? 'item' : 'items')) : null,
      p.state === 'not-connected'
        ? h('p', { role: 'status', className: 'bc-muted bc-feed-empty' }, p.emptyText || 'The Sentinel feed is not connected here. Items appear when the feed answers with measured data.')
        : items.length ? h('ol', { className: 'bc-feed-list', 'aria-label': (p.title || 'Feed') + ' items' }, items.map(function (it) { return h(FeedItem, Object.assign({ key: it.id || it.title }, it)); }))
        : h('p', { role: 'status', className: 'bc-muted bc-feed-empty' }, 'No items yet.'),
      p.footer !== false ? h('p', { className: 'bc-caption-text bc-feed-foot' }, p.footer || 'Newest first. New items wait above the list until you show them.') : null);
  }

  // ── Broadcaster, world and agent stats ───────────────────────────────
  var useState = React.useState;
  function compact(n) {
    if (typeof n !== 'number' || !isFinite(n)) return null;
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }
  function Tip(p) {
    if (!p.tip) return null;
    return h('div', { className: 'bc-tip', role: 'status', style: { left: p.tip.x + 'px', top: p.tip.y + 'px' } },
      p.tip.rows.map(function (r, i) {
        return h('div', { key: i, className: 'bc-tip-row' }, r.key ? h('span', { className: 'bc-key bc-key-line bc-key-' + r.key, 'aria-hidden': 'true' }) : null,
          h('strong', null, r.value), h('span', null, r.label));
      }));
  }
  function tipAt(ev, box, rows) {
    var b = box.getBoundingClientRect(), t = ev.currentTarget.getBoundingClientRect();
    return { x: Math.min(Math.max(t.left - b.left + t.width / 2, 60), b.width - 60), y: t.top - b.top, rows: rows };
  }
  function Legend(p) {
    return h('ul', { className: 'bc-legend' }, p.items.map(function (it) {
      return h('li', { key: it.key }, h('span', { className: 'bc-key bc-key-' + it.key, 'aria-hidden': 'true' }), it.label);
    }));
  }

  function Sparkline(p) {
    var v = p.values, w = 96, hgt = 28, max = Math.max.apply(null, v), min = Math.min.apply(null, v), rng = max - min || 1;
    var pts = v.map(function (x, i) { return [i * (w - 8) / (v.length - 1) + 4, hgt - 4 - (x - min) / rng * (hgt - 8)]; });
    var last = pts[pts.length - 1];
    return h('svg', { className: 'bc-spark', width: w, height: hgt, viewBox: '0 0 ' + w + ' ' + hgt, 'aria-hidden': 'true' },
      h('polyline', { className: 'bc-spark-line', points: pts.map(function (q) { return q.join(','); }).join(' ') }),
      h('circle', { className: 'bc-spark-dot bc-fill-' + (p.series || 'ink'), cx: last[0], cy: last[1], r: 4 }));
  }

  // label · value · delta vs a named period · optional 12-point trend. No value = Unmeasured.
  function StatTile(p) {
    var v = compact(p.value), d = p.delta;
    var good = d ? (d.value >= 0) === (d.goodWhenUp !== false) : null;
    return h('div', { className: cx('bc-stat', p.className) },
      h('p', { className: 'bc-stat-label' }, p.series ? h('span', { className: 'bc-key bc-key-' + p.series, 'aria-hidden': 'true' }) : p.icon ? h(Icon, { name: p.icon, size: 14 }) : null, p.label),
      h('div', { className: 'bc-stat-row' },
        v != null ? h('p', { className: 'bc-stat-value' }, v, p.unit ? h('span', { className: 'bc-stat-unit' }, ' ' + p.unit) : null) : h('p', { className: 'bc-stat-value bc-stat-none' }, 'Unmeasured'),
        v != null && p.trend && p.trend.length > 1 ? h(Sparkline, { values: p.trend, series: p.series }) : null),
      d && v != null ? h('p', { className: cx('bc-stat-delta', good ? 'bc-delta-good' : 'bc-delta-bad') },
        (d.value > 0 ? '+' : d.value < 0 ? '−' : '') + compact(Math.abs(d.value)) + (d.percent ? '%' : '') + ' vs ' + d.period) : null,
      p.note ? h('p', { className: 'bc-stat-note' }, p.note) : null);
  }

  // Kestrel source labels: how much a claim can be trusted, and why.
  var TRUST = { CANONICAL: 'green', VERIFIED: 'green', SOURCED: 'teal', RECALLED: 'neutral', INFERRED: 'amber', UNVERIFIED: 'neutral', DISPUTED: 'red', REFUTED: 'red', UNKNOWN: 'neutral' };
  function TrustLabel(p) {
    var l = String(p.label || 'UNKNOWN').toUpperCase();
    var ok = (l !== 'VERIFIED' && l !== 'SOURCED') || p.evidence;
    if (!ok) l = 'UNVERIFIED';
    return h('span', { className: cx('bc-pill', 'bc-tone-' + (TRUST[l] || 'neutral'), p.className), title: p.evidence ? 'Evidence: ' + p.evidence : undefined },
      h(Icon, { name: l === 'VERIFIED' || l === 'CANONICAL' ? 'badge-check' : l === 'SOURCED' ? 'file-search' : 'circle-dot', size: 12 }), l);
  }

  function BroadcasterCard(p) {
    return h('section', { className: cx('bc-card bc-pad-5 bc-broadcaster', p.className), 'aria-label': 'Broadcaster ' + p.name },
      h('div', { className: 'bc-broadcaster-head' },
        h('span', { className: 'bc-avatar', 'aria-hidden': 'true' }, p.children || Initials(p.name)),
        h('div', { className: 'bc-broadcaster-id' },
          h('p', { className: 'bc-kicker' }, h(Icon, { name: 'antenna', size: 14 }), p.kicker || 'Broadcaster'),
          h('h2', { className: 'bc-h-2xl' }, p.name),
          h('p', { className: 'bc-muted' }, [p.handle, p.role].filter(Boolean).join(' · '))),
        h('div', { className: 'bc-broadcaster-status' }, h(SessionStatus, { status: p.status || 'scheduled', label: p.status === 'live' ? 'On air' : p.status === 'ended' ? 'Off air' : undefined }),
          p.verified ? h(Badge, { tone: 'green' }, 'Verified seat') : h(Badge, null, 'Seat not verified'))),
      p.bio ? h('p', { className: 'bc-broadcaster-bio' }, p.bio) : null,
      p.stats && p.stats.length ? h('div', { className: 'bc-kpis' }, p.stats.map(function (s) { return h(StatTile, Object.assign({ key: s.label }, s)); })) : null);
  }

  // Where people watch from. One series (people), bars by region, value at the tip.
  function WorldAudience(p) {
    var all = p.regions || [], minN = p.minCount || 5;
    var regions = all.filter(function (r) { return r.value >= minN; }).sort(function (a, b) { return b.value - a.value; });
    var unknown = (p.unknown || 0) + all.filter(function (r) { return r.value < minN; }).reduce(function (t, r) { return t + r.value; }, 0);
    var max = Math.max.apply(null, regions.map(function (r) { return r.value; }).concat([1]));
    var st = useState(null), tip = st[0], setTip = st[1], tb = useState(false), table = tb[0], setTable = tb[1];
    var box = React.useRef(null);
    var total = typeof p.total === 'number' ? p.total : null;
    return h('section', { className: cx('bc-card bc-pad-5 bc-chart', p.className), 'aria-labelledby': 'bc-world-t' },
      h('div', { className: 'bc-row-between' },
        h('div', null, h('h3', { id: 'bc-world-t', className: 'bc-h-lg bc-with-icon' }, h(Icon, { name: 'globe', size: 18 }), p.title || 'People watching, by region'),
          h('p', { className: 'bc-muted' }, (total != null ? total.toLocaleString() + ' people' : 'Audience unmeasured') + (p.period ? ' · ' + p.period : ''))),
        h('button', { type: 'button', className: 'bc-textbtn', 'aria-pressed': table, onClick: function () { setTable(!table); } }, table ? 'Show chart' : 'Show table')),
      table ? h('table', { className: 'bc-table' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Region'), h('th', { scope: 'col', className: 'bc-num' }, 'People'))),
        h('tbody', null, regions.map(function (r) { return h('tr', { key: r.name }, h('th', { scope: 'row' }, r.name), h('td', { className: 'bc-num' }, r.value.toLocaleString())); }),
          unknown ? h('tr', null, h('th', { scope: 'row' }, 'Region not shared'), h('td', { className: 'bc-num' }, unknown.toLocaleString())) : null))
      : h('div', { className: 'bc-bars-h', ref: box, onPointerLeave: function () { setTip(null); } },
        regions.map(function (r) {
          var show = function (ev) { setTip(tipAt(ev, box.current, [{ key: 'human', value: r.value.toLocaleString(), label: r.name }])); };
          return h('div', { key: r.name, className: 'bc-hbar-row' },
            h('span', { className: 'bc-hbar-label' }, r.name),
            h('span', { className: 'bc-hbar-track' }, h('span', { className: 'bc-hbar bc-fill-human', tabIndex: 0, 'aria-label': r.name + ': ' + r.value.toLocaleString() + ' people', style: { width: Math.max(2, r.value / max * 100) + '%' }, onPointerMove: show, onFocus: show, onBlur: function () { setTip(null); } }),
              h('span', { className: 'bc-hbar-value' }, compact(r.value))));
        }),
        unknown ? h('div', { className: 'bc-hbar-row bc-hbar-unknown' }, h('span', { className: 'bc-hbar-label' }, 'Region not shared'), h('span', { className: 'bc-evidence bc-muted-ink' }, compact(unknown) + ' people, not charted')) : null,
        h(Tip, { tip: tip })),
      p.note ? h('p', { className: 'bc-caption-text' }, p.note) : null);
  }

  // 24 hours, two rows sharing one time axis: people watching, agents working.
  function PresenceTimeline(p) {
    var hours = p.hours || [];
    var st = useState(null), tip = st[0], setTip = st[1], hv = useState(-1), hover = hv[0], setHover = hv[1];
    var box = React.useRef(null);
    var maxH = Math.max.apply(null, hours.map(function (x) { return x.humans || 0; }).concat([1]));
    var maxA = Math.max.apply(null, hours.map(function (x) { return x.agents || 0; }).concat([1]));
    var covered = hours.filter(function (x) { return !x.humans && x.agents > 0; }).length;
    var empty = hours.filter(function (x) { return !x.humans; }).length;
    function row(key, label, max) {
      return h('div', { className: 'bc-tl-row' },
        h('span', { className: 'bc-tl-label' }, h('span', { className: 'bc-key bc-key-' + key, 'aria-hidden': 'true' }), label, h('span', { className: 'bc-evidence bc-muted-ink' }, ' peak ' + max)),
        h('div', { className: 'bc-tl-cols' }, hours.map(function (x, i) {
          var v = key === 'human' ? x.humans : x.agents;
          return h('span', { key: i, className: cx('bc-tl-col', hover === i ? 'bc-tl-hover' : null) },
            v ? h('span', { className: 'bc-tl-bar bc-fill-' + key, style: { height: Math.max(2, v / max * 100) + '%' } }) : h('span', { className: 'bc-tl-zero' }));
        })));
    }
    return h('section', { className: cx('bc-card bc-pad-5 bc-chart', p.className), 'aria-labelledby': 'bc-tl-t' },
      h('div', { className: 'bc-row-between' },
        h('div', null, h('h3', { id: 'bc-tl-t', className: 'bc-h-lg bc-with-icon' }, h(Icon, { name: 'activity', size: 18 }), p.title || 'Last 24 hours'),
          h('p', { className: 'bc-muted' }, empty ? 'No one watched for ' + empty + ' of ' + hours.length + ' hours. Agents worked in ' + covered + ' of them.' : 'Someone watched in every hour.')),
        h(Legend, { items: [{ key: 'human', label: 'People watching' }, { key: 'agent', label: 'Agents working' }] })),
      h('div', { className: 'bc-tl', ref: box, onPointerLeave: function () { setTip(null); setHover(-1); } },
        row('human', 'People', maxH), row('agent', 'Agents', maxA),
        h('div', { className: 'bc-tl-row bc-tl-axis' }, h('span', { className: 'bc-tl-label' }),
          h('div', { className: 'bc-tl-cols' }, hours.map(function (x, i) {
            var show = function (ev) { setHover(i); setTip(tipAt(ev, box.current, [{ value: x.t, label: '' }, { key: 'human', value: String(x.humans || 0), label: 'people watching' }, { key: 'agent', value: String(x.agents || 0), label: 'agents working' }])); };
            return h('span', { key: i, className: 'bc-tl-hit', tabIndex: 0, 'aria-label': x.t + ': ' + (x.humans || 0) + ' people watching, ' + (x.agents || 0) + ' agents working', onPointerMove: show, onFocus: show, onBlur: function () { setTip(null); setHover(-1); } },
              i % 6 === 0 ? h('span', { className: 'bc-tl-tick' }, x.t) : null);
          }))),
        h(Tip, { tip: tip })));
  }

  // Who uses the broadcaster's content: people vs agents per item, plus how.
  function ContentUse(p) {
    var items = p.items || [];
    var max = Math.max.apply(null, items.map(function (x) { return (x.humans || 0) + (x.agents || 0); }).concat([1]));
    var st = useState(null), tip = st[0], setTip = st[1];
    var box = React.useRef(null);
    return h('section', { className: cx('bc-card bc-pad-5 bc-chart', p.className), 'aria-labelledby': 'bc-use-t' },
      h('div', { className: 'bc-row-between' },
        h('div', null, h('h3', { id: 'bc-use-t', className: 'bc-h-lg bc-with-icon' }, h(Icon, { name: 'share-2', size: 18 }), p.title || 'Who is using this content'), p.period ? h('p', { className: 'bc-muted' }, p.period) : null),
        h(Legend, { items: [{ key: 'human', label: 'People' }, { key: 'agent', label: 'Agents' }] })),
      h('ul', { className: 'bc-use', ref: box, onPointerLeave: function () { setTip(null); } }, items.map(function (x) {
        var tot = (x.humans || 0) + (x.agents || 0);
        var seg = function (key, v, label) {
          if (!v) return null;
          var show = function (ev) { setTip(tipAt(ev, box.current, [{ key: key, value: v.toLocaleString(), label: label + ' · ' + x.title }])); };
          return h('span', { className: 'bc-seg bc-fill-' + key, tabIndex: 0, 'aria-label': x.title + ': ' + v + ' ' + label, style: { width: (v / max * 100) + '%' }, onPointerMove: show, onFocus: show, onBlur: function () { setTip(null); } });
        };
        return h('li', { key: x.title, className: 'bc-use-row' },
          h('div', { className: 'bc-use-head' }, h('span', { className: 'bc-use-title' }, x.title), h('span', { className: 'bc-use-total' }, compact(tot) + ' uses')),
          h('div', { className: 'bc-use-track' }, seg('human', x.humans, 'by people'), seg('agent', x.agents, 'by agents')),
          x.how ? h('p', { className: 'bc-evidence bc-muted-ink' }, x.how) : null);
      }), h(Tip, { tip: tip })),
      h('p', { className: 'bc-caption-text' }, p.note || 'A use is a class taught from it, an embed, a citation or a remix. Agent uses are research, improvement and verification runs.'));
  }

  var TASK = { research: ['Research', 'search-check'], improve: ['Improve', 'pen-line'], verify: ['Verify', 'badge-check'] };
  var TSTATUS = { running: ['Running', 'green'], queued: ['Queued', 'neutral'], proposed: ['Proposed · awaiting review', 'amber'], accepted: ['Accepted by a person', 'green'], rejected: ['Rejected', 'neutral'], blocked: ['Blocked', 'red'] };
  function AgentActivity(p) {
    var tasks = p.tasks || [];
    var running = tasks.filter(function (t) { return t.status === 'running'; }).length;
    var waiting = typeof p.awaiting === 'number' ? p.awaiting : tasks.filter(function (t) { return t.status === 'proposed'; }).length;
    var working = typeof p.working === 'number' ? p.working : running;
    return h('section', { className: cx('bc-card bc-agents', p.className), 'aria-labelledby': 'bc-ag-t' },
      h('header', { className: 'bc-agents-head' },
        h('div', null, h('p', { className: 'bc-kicker' }, h(Icon, { name: 'bot', size: 14 }), 'Agents'), h('h3', { id: 'bc-ag-t', className: 'bc-h-xl' }, p.title || 'Working on this content')),
        h('p', { className: 'bc-evidence bc-muted-ink' }, working + ' working · ' + waiting + ' awaiting review')),
      p.unattended ? h('p', { role: 'status', className: 'bc-unattended' }, h(Icon, { name: 'eye', size: 16 }),
        'No one is watching right now. ' + working + (working === 1 ? ' agent is' : ' agents are') + ' researching, improving or verifying this content. Nothing they change is published until a person accepts it.') : null,
      p.stats && p.stats.length ? h('div', { className: 'bc-kpis bc-agents-kpis' }, p.stats.map(function (s) { return h(StatTile, Object.assign({ key: s.label, series: 'agent' }, s)); })) : null,
      tasks.length ? h('ol', { className: 'bc-tasks', 'aria-label': 'Agent tasks' }, tasks.map(function (t, i) {
        var k = TASK[t.kind] || TASK.research, s = TSTATUS[t.status] || TSTATUS.queued;
        return h('li', { key: t.id || i, className: 'bc-task' },
          h('div', { className: 'bc-task-head' },
            h('span', { className: 'bc-task-kind' }, h(Icon, { name: k[1], size: 14 }), k[0]),
            h('span', { className: 'bc-task-agent' }, h(Icon, { name: 'bot', size: 14 }), t.agent),
            h('span', { className: cx('bc-pill', 'bc-tone-' + s[1]) }, h('span', { className: 'bc-dot bc-dot-' + s[1], 'aria-hidden': 'true' }), s[0]),
            t.time ? h('time', { className: 'bc-feed-time' }, t.time) : null),
          h('p', { className: 'bc-task-target' }, t.target),
          t.result ? h('p', { className: 'bc-task-result' }, t.result) : null,
          h('p', { className: 'bc-feed-meta' }, t.label ? h(TrustLabel, { label: t.label, evidence: t.evidenceRef }) : null,
            h('span', null, h(Icon, { name: 'file-search', size: 12 }), ' ' + (t.evidence || 0) + ' evidence'), t.evidenceRef ? h('span', null, t.evidenceRef) : null));
      })) : h('p', { className: 'bc-muted bc-feed-empty' }, 'No agent work on this content.'),
      h('p', { className: 'bc-caption-text bc-feed-foot' }, p.footer || 'Agents propose; people publish. A claim reads VERIFIED only with a resolvable evidence reference.'));
  }

  window.BndClassroom = { Button: Button, Badge: Badge, StatePill: StatePill, SectionLabel: SectionLabel, Card: Card, Rule: Rule, Icon: Icon,
    SessionStatus: SessionStatus, SignalMeter: SignalMeter, BroadcastStage: BroadcastStage, ParticipantTile: ParticipantTile,
    MediaControls: MediaControls, AttendanceList: AttendanceList, DiscussionMessage: DiscussionMessage,
    TransportBadge: TransportBadge, LatencyReadout: LatencyReadout, UtilizationLadder: UtilizationLadder, RelayPath: RelayPath,
    TrackCatalog: TrackCatalog, ChannelCard: ChannelCard, FeedItem: FeedItem, LiveFeed: LiveFeed,
    StatTile: StatTile, TrustLabel: TrustLabel, BroadcasterCard: BroadcasterCard, WorldAudience: WorldAudience,
    PresenceTimeline: PresenceTimeline, ContentUse: ContentUse, AgentActivity: AgentActivity };
})();
