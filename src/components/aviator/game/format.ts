export function formatMoney(n: number): string {
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMultiplier(n: number): string {
  return `${n.toFixed(2)}x`;
}

export function multiplierBadgeClass(m: number): string {
  if (m < 2) return 'bg-aviator-blue/15 text-aviator-blue-soft border-aviator-blue/30';
  if (m <= 10) return 'bg-aviator-purple/20 text-aviator-purple-soft border-aviator-purple/40';
  return 'bg-aviator-magenta/20 text-aviator-magenta-bright border-aviator-magenta/50';
}

const NAMES = [
  'Rajesh', 'Priya', 'Aarav', 'Vikram', 'Neha', 'Arjun', 'Sneha', 'Karan',
  'Divya', 'Rohan', 'Anika', 'Sahil', 'Meera', 'Aditya', 'Pooja', 'Rahul',
  'Ishaan', 'Tanvi', 'Manav', 'Kavya', 'Yash', 'Sara', 'Dev', 'Riya',
  'Aryan', 'Nisha', 'Kabir', 'Zara', 'Veer', 'Anaya', 'Reyansh', 'Myra',
  'Krish', 'Diya', 'Arnav', 'Anvi', 'Dhruv', 'Kiara', 'Vivaan', 'Aisha',
];

export function randomName(): string {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
}

export function randomAvatarColor(): string {
  const colors = [
    '#e11d48', '#f59e0b', '#22c55e', '#38bdf8', '#a855f7',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
