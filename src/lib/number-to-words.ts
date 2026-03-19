/**
 * Convert a number to British English words for valuation reports.
 * e.g., 488000 → "Four Hundred and Eighty Eight Thousand Pounds"
 */

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertHundreds(n: number): string {
  if (n === 0) return '';

  let result = '';
  if (n >= 100) {
    result += ones[Math.floor(n / 100)] + ' Hundred';
    n %= 100;
    if (n > 0) result += ' and ';
  }

  if (n >= 20) {
    result += tens[Math.floor(n / 10)];
    if (n % 10 > 0) result += ' ' + ones[n % 10];
  } else if (n > 0) {
    result += ones[n];
  }

  return result;
}

export function numberToWords(num: number): string {
  if (num === 0) return 'Zero Pounds';
  if (num < 0) return 'Minus ' + numberToWords(-num);

  // Round to nearest whole number
  num = Math.round(num);

  const parts: string[] = [];

  if (num >= 1_000_000) {
    const millions = Math.floor(num / 1_000_000);
    parts.push(convertHundreds(millions) + ' Million');
    num %= 1_000_000;
  }

  if (num >= 1_000) {
    const thousands = Math.floor(num / 1_000);
    parts.push(convertHundreds(thousands) + ' Thousand');
    num %= 1_000;
  }

  if (num > 0) {
    // Add "and" before the last part if we have higher parts
    const hundredsStr = convertHundreds(num);
    if (parts.length > 0 && num < 100) {
      parts.push('and ' + hundredsStr);
    } else {
      parts.push(hundredsStr);
    }
  }

  return parts.join(' ') + ' Pounds';
}
