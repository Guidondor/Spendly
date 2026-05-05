export function formatMoney(amount) {
  const num = Math.abs(Number(amount) || 0);
  const [int, dec] = num.toFixed(2).split('.');
  return `$${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}
