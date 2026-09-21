// Shared helpers for estate.pb.js (CommonJS; required inside handlers).
const SEAT_FIELD = 'cnwb_seat_level';
const MASTER = 'master';
function isSuperuser(e) {
    try { return typeof e.hasSuperuserAuth === 'function' ? e.hasSuperuserAuth() : false; } catch (_err) { return false; }
}
module.exports = { SEAT_FIELD, MASTER, isSuperuser };
