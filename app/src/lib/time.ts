const TIME_ZONE = 'America/Sao_Paulo';

function partsAt(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function zonedDateTimeToUtc(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const represented = partsAt(new Date(guess));
  const representedAsUtc = Date.UTC(
    Number(represented.year),
    Number(represented.month) - 1,
    Number(represented.day),
    Number(represented.hour),
    Number(represented.minute),
    Number(represented.second),
  );
  return new Date(guess - (representedAsUtc - guess));
}

export function dateKeyInClinicTimeZone(date = new Date()) {
  const parts = partsAt(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function timeKeyInClinicTimeZone(date = new Date()) {
  const parts = partsAt(date);
  return `${parts.hour}:${parts.minute}`;
}

export function localDateBounds(date: string) {
  return {
    start: zonedDateTimeToUtc(date, '00:00'),
    end: zonedDateTimeToUtc(date, '23:59'),
  };
}

export function weekdayForLocalDate(date: string) {
  const noon = zonedDateTimeToUtc(date, '12:00');
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
  }).format(noon);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}

export function formatClinicDateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export { TIME_ZONE };
