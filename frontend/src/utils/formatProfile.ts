export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
};

export const formatGender = (gender: string): string => {
  if (!gender) return '';
  return gender === 'male' ? '남' : '여';
};
