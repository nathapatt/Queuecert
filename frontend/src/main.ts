import './style.css'
import { api, ApiError } from './api'
import type { Concert, Seat } from './api'
import {
  ATTENDEES,
  POSTERS,
  FALLBACK_PALETTE,
  DEMO_CONCERTS,
  demoSeats,
} from './data'
import type { Attendee } from './data'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type View = 'browse' | 'detail'

type State = {
  view: View
  online: boolean | null // null = unknown / checking
  concerts: Concert[]
  loadingConcerts: boolean
  concert: Concert | null
  seats: Seat[]
  loadingSeats: boolean
  seatId: string | null
  attendee: Attendee
}

const state: State = {
  view: 'browse',
  online: null,
  concerts: [],
  loadingConcerts: true,
  concert: null,
  seats: [],
  loadingSeats: false,
  seatId: null,
  attendee: ATTENDEES[0],
}

const app = document.querySelector<HTMLDivElement>('#app')!

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const accentFor = (name: string, idx = 0) =>
  POSTERS[name]?.hue ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]

const tagFor = (name: string) => POSTERS[name]?.tag ?? 'LIVE / GENERAL'

function fmtDate(iso: string) {
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString('en-US', { day: '2-digit' }),
    mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    year: d.getFullYear(),
    full: d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }
}

function seatLabel(s: Seat) {
  return `${s.row}${s.number}`
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadConcerts() {
  state.loadingConcerts = true
  render()
  try {
    const concerts = await api.concerts()
    state.concerts = concerts.length ? concerts : DEMO_CONCERTS
    state.online = concerts.length > 0
    if (!concerts.length) state.online = true // API up but empty -> still real
  } catch {
    state.concerts = DEMO_CONCERTS
    state.online = false
  } finally {
    state.loadingConcerts = false
    render()
  }
}

async function openConcert(concert: Concert) {
  state.concert = concert
  state.view = 'detail'
  state.seatId = null
  state.seats = []
  state.loadingSeats = true
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  render()
  try {
    if (!state.online) throw new Error('offline')
    state.seats = await api.seats(concert.id)
  } catch {
    state.seats = demoSeats(concert.id)
  } finally {
    state.loadingSeats = false
    render()
  }
}

function backToBrowse() {
  state.view = 'browse'
  state.concert = null
  state.seatId = null
  render()
}

// ---------------------------------------------------------------------------
// Rendering — page
// ---------------------------------------------------------------------------

function render() {
  if (state.view === 'detail' && state.concert) {
    app.innerHTML = header() + detailView(state.concert)
  } else {
    app.innerHTML = header() + browseView()
  }
  wire()
}

function header() {
  const status =
    state.online === null
      ? `<span class="dot dot--idle"></span>connecting`
      : state.online
        ? `<span class="dot dot--live"></span>service live`
        : `<span class="dot dot--demo"></span>offline demo`
  return `
  <header class="topbar">
    <a class="brand" data-nav="home" href="#">
      <span class="brand__mark">◑</span>
      <span class="brand__word">QUEUE<span>CERT</span></span>
    </a>
    <div class="topbar__meta">
      <span class="status">${status}</span>
    </div>
  </header>`
}

// --- Browse ----------------------------------------------------------------

function browseView() {
  return `
  <main class="page">
    ${hero()}
    <section class="lineup" id="lineup">
      <div class="lineup__head">
        <h2 class="section-title">The lineup</h2>
        <p class="section-sub">${state.concerts.length} nights on sale — pick yours.</p>
      </div>
      ${
        state.loadingConcerts
          ? `<div class="grid">${posterSkeleton()}${posterSkeleton()}${posterSkeleton()}</div>`
          : `<div class="grid">${state.concerts.map((c, i) => posterCard(c, i)).join('')}</div>`
      }
    </section>
    ${footer()}
  </main>`
}

function hero() {
  return `
  <section class="hero">
    <div class="hero__grain" aria-hidden="true"></div>
    <div class="hero__inner">
      <p class="hero__kicker"><span>●</span> SEASON 2025 — 2026 &nbsp;/&nbsp; LIVE TICKETING</p>
      <h1 class="hero__title">
        Don't just<br />stream it.<br /><em>Be there.</em>
      </h1>
      <p class="hero__lede">
        Real seats, real-time. Queuecert holds your spot the moment you tap —
        no refresh wars, no phantom carts.
      </p>
      <div class="hero__cta">
        <a class="btn btn--solid" href="#lineup" data-scroll="lineup">Browse the lineup ↓</a>
        <span class="hero__note">${state.online === false ? 'Showing offline demo data' : 'Powered by Kafka · settles in seconds'}</span>
      </div>
    </div>
    <div class="hero__ticketstrip" aria-hidden="true">
      ${Array.from({ length: 2 })
        .map(
          () =>
            `<span>QUEUECERT</span><span class="sep">✦</span><span>ADMIT ONE</span><span class="sep">✦</span><span>LIVE THE MOMENT</span><span class="sep">✦</span>`,
        )
        .join('')}
    </div>
  </section>`
}

function posterCard(c: Concert, i: number) {
  const accent = accentFor(c.name, i)
  const d = fmtDate(c.event_date)
  return `
  <button class="poster" data-concert="${c.id}" style="--accent:${accent}">
    <div class="poster__art" aria-hidden="true">
      <div class="poster__halftone"></div>
      <span class="poster__index">${String(i + 1).padStart(2, '0')}</span>
      <span class="poster__tag">${esc(tagFor(c.name))}</span>
    </div>
    <div class="poster__body">
      <h3 class="poster__name">${esc(c.name)}</h3>
      <p class="poster__venue">${esc(c.venue)}</p>
      <div class="poster__foot">
        <span class="poster__date">${d.day} ${d.mon} ’${String(d.year).slice(2)}</span>
        <span class="poster__go">Get seats →</span>
      </div>
    </div>
  </button>`
}

function posterSkeleton() {
  return `<div class="poster poster--skeleton"><div class="poster__art"></div><div class="poster__body"><span class="sk sk--l"></span><span class="sk sk--m"></span><span class="sk sk--s"></span></div></div>`
}

// --- Detail / seat map -----------------------------------------------------

function detailView(c: Concert) {
  const accent = accentFor(c.name, state.concerts.findIndex((x) => x.id === c.id))
  const d = fmtDate(c.event_date)
  return `
  <main class="page detail" style="--accent:${accent}">
    <button class="back" data-nav="home">← All shows</button>
    <section class="detail__head">
      <div>
        <p class="detail__tag">${esc(tagFor(c.name))}</p>
        <h1 class="detail__title">${esc(c.name)}</h1>
        <p class="detail__meta">
          <span>${esc(c.venue)}</span><span class="bullet">•</span><span>${d.full}</span><span class="bullet">•</span><span>${d.time}</span>
        </p>
      </div>
    </section>

    <div class="booking">
      <section class="map" aria-label="Seat map">
        <div class="stage"><span>STAGE</span></div>
        ${
          state.loadingSeats
            ? `<div class="map__loading">loading seats…</div>`
            : seatGrid(state.seats)
        }
        <div class="legend">
          <span><i class="chip chip--free"></i>Available</span>
          <span><i class="chip chip--sel"></i>Selected</span>
          <span><i class="chip chip--lock"></i>Held</span>
          <span><i class="chip chip--taken"></i>Sold</span>
        </div>
      </section>

      ${summaryRail(c)}
    </div>
    ${footer()}
  </main>`
}

function seatGrid(seats: Seat[]) {
  if (!seats.length) return `<div class="map__loading">No seats published yet.</div>`
  const rows = new Map<string, Seat[]>()
  for (const s of seats) {
    if (!rows.has(s.row)) rows.set(s.row, [])
    rows.get(s.row)!.push(s)
  }
  const ordered = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b))
  return `<div class="seatmap">${ordered
    .map(
      ([row, list]) => `
      <div class="seatrow">
        <span class="seatrow__label">${esc(row)}</span>
        <div class="seatrow__seats">
          ${list
            .sort((a, b) => a.number - b.number)
            .map((s) => seatBtn(s))
            .join('')}
        </div>
        <span class="seatrow__label">${esc(row)}</span>
      </div>`,
    )
    .join('')}</div>`
}

function seatBtn(s: Seat) {
  const selected = state.seatId === s.id
  const cls =
    s.status === 'booked'
      ? 'seat seat--taken'
      : s.status === 'locked'
        ? 'seat seat--lock'
        : selected
          ? 'seat seat--sel'
          : 'seat seat--free'
  const disabled = s.status !== 'available'
  return `<button class="${cls}" ${disabled ? 'disabled aria-disabled="true"' : `data-seat="${s.id}"`} title="${seatLabel(s)}">${s.number}</button>`
}

function summaryRail(c: Concert) {
  const seat = state.seats.find((s) => s.id === state.seatId) ?? null
  const d = fmtDate(c.event_date)
  return `
  <aside class="rail">
    <div class="rail__card">
      <p class="rail__eyebrow">YOUR ORDER</p>
      <h2 class="rail__show">${esc(c.name)}</h2>
      <dl class="rail__rows">
        <div><dt>Venue</dt><dd>${esc(c.venue)}</dd></div>
        <div><dt>Date</dt><dd>${d.full}</dd></div>
        <div><dt>Doors</dt><dd>${d.time}</dd></div>
        <div><dt>Seat</dt><dd class="rail__seat">${seat ? seatLabel(seat) : '— pick one'}</dd></div>
      </dl>

      <p class="rail__eyebrow">ATTENDEE</p>
      <div class="who">
        ${ATTENDEES.map(
          (a) => `
          <button class="who__btn ${a.id === state.attendee.id ? 'is-on' : ''}" data-attendee="${a.id}">
            <span class="who__avatar">${a.initials}</span>
            <span class="who__name">${a.name}</span>
          </button>`,
        ).join('')}
      </div>

      <button class="btn btn--solid btn--block" data-reserve ${seat ? '' : 'disabled'}>
        ${seat ? `Reserve ${seatLabel(seat)} →` : 'Select a seat'}
      </button>
      <p class="rail__fine">Held for 5 minutes while the venue confirms. No charge in this demo.</p>
    </div>
  </aside>`
}

function footer() {
  return `
  <footer class="foot">
    <span class="foot__mark">◑ QUEUECERT</span>
    <span class="foot__txt">Kafka · FastAPI · PostgreSQL · Redis — MIT licensed</span>
    <span class="foot__yr">© 2025 Queuecert Contributors</span>
  </footer>`
}

// ---------------------------------------------------------------------------
// Booking overlay (kept outside #app so animations survive polling)
// ---------------------------------------------------------------------------

let overlayEl: HTMLDivElement | null = null

function ensureOverlay(): HTMLDivElement {
  if (!overlayEl) {
    overlayEl = document.createElement('div')
    overlayEl.id = 'overlay'
    document.body.appendChild(overlayEl)
  }
  return overlayEl
}

function closeOverlay() {
  if (!overlayEl) return
  overlayEl.classList.remove('is-open')
  const el = overlayEl
  setTimeout(() => el.remove(), 280)
  overlayEl = null
  document.body.style.overflow = ''
}

function setOverlay(html: string) {
  const el = ensureOverlay()
  el.innerHTML = `<div class="modal__scrim" data-close></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`
  requestAnimationFrame(() => el.classList.add('is-open'))
  document.body.style.overflow = 'hidden'
  el.querySelector('[data-close]')?.addEventListener('click', closeOverlay)
}

async function placeBooking() {
  const c = state.concert
  const seat = state.seats.find((s) => s.id === state.seatId)
  if (!c || !seat) return

  // processing screen
  setOverlay(processingCard(c, seat))

  try {
    let result: { status: string; booking_id: string; message: string }
    if (!state.online) {
      // offline demo — simulate the Kafka round-trip
      await sleep(2200)
      result = { status: 'confirmed', booking_id: cryptoId(), message: 'Demo confirmation' }
    } else {
      const placed = await api.book({
        user_id: state.attendee.id,
        concert_id: c.id,
        seat_id: seat.id,
      })
      result = placed
      // poll until the seat-service settles it (confirmed / failed)
      let tries = 0
      while (result.status === 'pending' && tries < 12) {
        await sleep(1100)
        result = await api.booking(placed.booking_id)
        tries++
      }
    }

    if (result.status === 'confirmed') {
      seat.status = 'booked'
      state.seatId = null
      setOverlay(ticketCard(c, seat, result.booking_id))
      render()
    } else {
      setOverlay(failCard(c, seat, result.message || 'The seat slipped away.'))
    }
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Could not reach the booking service.'
    setOverlay(failCard(c, seat, msg))
  }
  wireOverlay()
}

function processingCard(c: Concert, seat: Seat) {
  return `
  <div class="proc">
    <div class="proc__pulse"><span></span><span></span><span></span></div>
    <h3 class="proc__title">Holding ${seatLabel(seat)}…</h3>
    <p class="proc__sub">Queuing your request for <strong>${esc(c.name)}</strong> and waiting for the venue to confirm.</p>
    <div class="proc__pipe">
      <span class="proc__node is-on">request</span>
      <span class="proc__wire"></span>
      <span class="proc__node is-on">seat lock</span>
      <span class="proc__wire"></span>
      <span class="proc__node">confirm</span>
    </div>
  </div>`
}

function ticketCard(c: Concert, seat: Seat, bookingId: string) {
  const d = fmtDate(c.event_date)
  const accent = accentFor(c.name)
  return `
  <button class="modal__x" data-close aria-label="Close">✕</button>
  <div class="ticket" style="--accent:${accent}">
    <div class="ticket__main">
      <p class="ticket__brand">QUEUECERT · ADMIT ONE</p>
      <h3 class="ticket__show">${esc(c.name)}</h3>
      <p class="ticket__venue">${esc(c.venue)}</p>
      <div class="ticket__grid">
        <div><span>DATE</span><strong>${d.day} ${d.mon} ${d.year}</strong></div>
        <div><span>DOORS</span><strong>${d.time}</strong></div>
        <div><span>SEAT</span><strong>${seatLabel(seat)}</strong></div>
        <div><span>GUEST</span><strong>${esc(state.attendee.name)}</strong></div>
      </div>
      <div class="ticket__status">✓ CONFIRMED</div>
    </div>
    <div class="ticket__stub">
      <div class="ticket__barcode" aria-hidden="true">${'<i></i>'.repeat(26)}</div>
      <p class="ticket__id">${esc(bookingId.slice(0, 8).toUpperCase())}</p>
      <p class="ticket__seat">${seatLabel(seat)}</p>
    </div>
  </div>
  <div class="modal__actions">
    <button class="btn btn--ghost" data-close>Done</button>
    <button class="btn btn--solid" data-close>Book another →</button>
  </div>`
}

function failCard(c: Concert, seat: Seat, reason: string) {
  return `
  <button class="modal__x" data-close aria-label="Close">✕</button>
  <div class="fail">
    <div class="fail__icon">✕</div>
    <h3 class="fail__title">Seat ${seatLabel(seat)} didn't make it</h3>
    <p class="fail__reason">${esc(reason)}</p>
    <p class="fail__sub">Someone may have grabbed it first. Pick another seat for <strong>${esc(c.name)}</strong>.</p>
    <div class="modal__actions">
      <button class="btn btn--solid btn--block" data-close>Choose another seat</button>
    </div>
  </div>`
}

function cryptoId() {
  return (crypto.randomUUID?.() ?? Math.random().toString(16).slice(2)).replace(/-/g, '')
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function wire() {
  app.querySelectorAll<HTMLElement>('[data-concert]').forEach((el) =>
    el.addEventListener('click', () => {
      const id = el.dataset.concert!
      const c = state.concerts.find((x) => x.id === id)
      if (c) openConcert(c)
    }),
  )

  app.querySelectorAll<HTMLElement>('[data-seat]').forEach((el) =>
    el.addEventListener('click', () => {
      state.seatId = state.seatId === el.dataset.seat ? null : el.dataset.seat!
      render()
    }),
  )

  app.querySelectorAll<HTMLElement>('[data-attendee]').forEach((el) =>
    el.addEventListener('click', () => {
      const a = ATTENDEES.find((x) => x.id === el.dataset.attendee)
      if (a) {
        state.attendee = a
        render()
      }
    }),
  )

  app.querySelectorAll<HTMLElement>('[data-nav="home"]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault()
      backToBrowse()
    }),
  )

  app.querySelectorAll<HTMLElement>('[data-scroll]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault()
      document.getElementById(el.dataset.scroll!)?.scrollIntoView({ behavior: 'smooth' })
    }),
  )

  app.querySelector('[data-reserve]')?.addEventListener('click', () => {
    if (state.seatId) placeBooking()
  })
}

function wireOverlay() {
  overlayEl?.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeOverlay),
  )
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlay()
})

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

render()
loadConcerts()
