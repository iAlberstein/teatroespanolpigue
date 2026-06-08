import DateInputMask from './DateInputMask';

export default function DateInput({ value, onChange, style, ...props }) {
  return (
    <DateInputMask
      value={value}
      onChange={onChange}
      style={style}
      {...props}
    />
  );
}
