export function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function occursOn(task, dateKey) {
  const rule = task.recurrence;
  if (!rule || dateKey < rule.startDate || (rule.until && dateKey > rule.until) || task.skippedDates?.[dateKey]) return false;
  if (rule.frequency === 'daily') return true;
  const day = new Date(`${dateKey}T12:00:00`).getDay();
  return rule.frequency === 'weekly' && rule.weekdays.includes(day);
}
export function expandTasks(tasks, start, end) {
  const result = tasks.filter(task => !task.recurrence && new Date(task.type === 'scheduled' ? task.startISO : task.deadlineISO) >= start && new Date(task.type === 'scheduled' ? task.startISO : task.deadlineISO) < end);
  for (const task of tasks.filter(task => task.recurrence)) {
    for (const day = new Date(start); day < end; day.setDate(day.getDate()+1)) {
      const dateKey = localDateKey(day);
      if (!occursOn(task, dateKey)) continue;
      const date = new Date(`${dateKey}T${task.recurrence.time}`);
      result.push({ ...task, id: `${task.id}@${dateKey}`, sourceId: task.id, occurrenceDate: dateKey, startISO: date.toISOString(), completed: !!task.completionDates?.[dateKey] });
    }
  }
  return result;
}
export function repeatLabel(rule) {
  if (!rule) return '';
  if (rule.frequency === 'daily') return '每天';
  const names = ['日','一','二','三','四','五','六'];
  return '每周' + rule.weekdays.map(day=>names[day]).join('、');
}
