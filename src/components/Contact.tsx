import { useState } from 'react';
import { Reveal } from './ui/Reveal';
import './Contact.css';

/* `href` alongside the display value so the revealed detail is the real thing
   rather than a string to copy out by hand. Phone gets the same treatment as
   email — a number that isn't dialable on the device most likely to be reading
   this would be the odd one out, not the considered choice. */
const DETAILS = [
  { label: 'Phone', value: '(587) 228-4528', href: 'tel:+15872284528' },
  { label: 'Email', value: 'evan.wushke@gmail.com', href: 'mailto:evan.wushke@gmail.com' },
];

export function Contact() {
  /* Which detail is showing, by label. Held as the label rather than as
     finished text so the value can be rendered as a link. */
  const [revealed, setRevealed] = useState<string | null>(null);
  const detail = DETAILS.find((d) => d.label === revealed) ?? null;

  return (
    <section className="section contact" id="contact">
      <div className="container contact__inner">
        <Reveal>
          <h2 className="section-title">contact.</h2>
        </Reveal>

        <Reveal index={1}>
          <form
            className="contact__form card"
            action="https://formsubmit.co/412ac771b108d616140b5f6b0843667b"
            method="POST"
          >
            {/* The pitch sits in the card with the fields it is asking you to
                fill in, rather than floating above it. */}
            <p className="contact__lede">
              Like what you see? Need a website made? Looking for a highly skilled and moderately
              handsome developer? Send me a message!
            </p>

            {/* Honeypot + captcha off (matches original) */}
            <input type="text" name="_honey" style={{ display: 'none' }} />
            <input type="hidden" name="_captcha" value="false" />

            <input type="text" name="name" placeholder="name" required />
            <input type="email" name="email" placeholder="email" required />
            {/* Five rows, not three: the message spans both columns, and at the
                card's full width three rows is a letterbox. */}
            <textarea name="message" placeholder="your message" required rows={5} />

            {/* Send and the two reveals on one row: they are the three things
                you can do with this card, and splitting them across the card's
                edge made the phone and email numbers look like a footnote to
                the form rather than an alternative to it.

                `type="button"` is load-bearing now that these live inside the
                form — a button with no type submits it. */}
            <div className="contact__actions">
              <button type="submit" className="btn btn--solid">
                Send
              </button>
              {DETAILS.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  className="btn btn--ghost"
                  aria-pressed={revealed === d.label}
                  onClick={() => setRevealed(revealed === d.label ? null : d.label)}
                >
                  {d.label}
                </button>
              ))}
              {detail && (
                <a className="contact__revealed" href={detail.href}>
                  {detail.value}
                </a>
              )}
            </div>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
