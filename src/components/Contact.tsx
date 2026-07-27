import { useState } from 'react';
import { Reveal } from './ui/Reveal';
import './Contact.css';

const DETAILS = [
  { label: 'Phone', value: '(587) 228-4528' },
  { label: 'Email', value: 'ewush956@mtroyal.ca' },
];

export function Contact() {
  const [revealed, setRevealed] = useState<string | null>(null);

  return (
    <section className="section contact" id="contact">
      <div className="container contact__inner">
        <Reveal>
          <h2 className="section-title">contact.</h2>
          <p className="contact__lede">
            Like what you see? Need a website made? Looking for a highly skilled and moderately
            handsome intern? Send me a message!
          </p>
        </Reveal>

        <Reveal index={1}>
          <form
            className="contact__form card"
            action="https://formsubmit.co/412ac771b108d616140b5f6b0843667b"
            method="POST"
          >
            {/* Honeypot + captcha off (matches original) */}
            <input type="text" name="_honey" style={{ display: 'none' }} />
            <input type="hidden" name="_captcha" value="false" />

            <input type="text" name="name" placeholder="name" required />
            <input type="email" name="email" placeholder="email" required />
            <textarea name="message" placeholder="your message" required rows={3} />
            <button type="submit" className="btn btn--solid">
              Send
            </button>
          </form>
        </Reveal>

        <Reveal index={2}>
          <div className="contact__details">
            {DETAILS.map((d) => (
              <button
                key={d.label}
                className="btn btn--ghost"
                onClick={() => setRevealed(revealed === d.label ? null : `${d.label}: ${d.value}`)}
              >
                {d.label}
              </button>
            ))}
            {revealed && <span className="contact__revealed">{revealed}</span>}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
