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
    const dates = new Set(Object.keys(task.overrides || {}));
    for (const day = new Date(start); day < end; day.setDate(day.getDate()+1)) {
      dates.add(localDateKey(day));
    }
    for (const dateKey of [...dates].sort()) {
      const occurrence = occurrenceFor(task, dateKey);
      if (occurrence && new Date(occurrence.startISO) >= start && new Date(occurrence.startISO) < end) result.push(occurrence);
    }
  }
  return result;
}
export function occurrenceFor(task, dateKey) {
  if (!occursOn(task, dateKey)) return null;
  const override = task.overrides?.[dateKey];
  const date = new Date(override?.startLocal || `${dateKey}T${task.recurrence.time}`);
  if (!Number.isFinite(date.getTime())) return null;
  return { ...task, title: override?.title ?? task.title, groupId:override&&Object.hasOwn(override,'groupId')?override.groupId:task.groupId, durationMin: override?.durationMin ?? task.durationMin, id: `${task.id}@${dateKey}`, sourceId: task.id, occurrenceDate: dateKey, startISO: date.toISOString(), completed: !!task.completionDates?.[dateKey], isOverride: !!override };
}
export function repeatLabel(rule) {
  if (!rule) return '';
  if (rule.frequency === 'daily') return '每天';
  const names = ['日','一','二','三','四','五','六'];
  return '每周' + rule.weekdays.map(day=>names[day]).join('、');
}
