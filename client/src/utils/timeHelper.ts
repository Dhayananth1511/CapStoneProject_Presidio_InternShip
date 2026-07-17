export function formatTimeAndPeriod(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hour = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(min)) return timeStr;

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMin = min < 10 ? `0${min}` : min;
  const formattedTime = `${displayHour}:${displayMin} ${ampm}`;

  let category = '';
  if (hour < 5) category = 'Late Night';
  else if (hour < 11) category = 'Morning';
  else if (hour < 13) category = 'Late Morning';
  else if (hour < 17) category = 'Afternoon';
  else if (hour < 20) category = 'Evening';
  else category = 'Night';

  return `${category} (${formattedTime})`;
}
