import LegalScreen from '@/components/LegalScreen';
import { SUPPORT_EMAIL } from '@/src/constants/legal';

const LAST_UPDATED = 'April 20, 2026';

export default function CommunityGuidelinesScreen() {
  return (
    <LegalScreen
      title="Community Guidelines"
      subtitle={`Last updated: ${LAST_UPDATED}`}
      sections={[
        {
          heading: 'Why we have these',
          paragraphs: [
            'Rencana is built so students can plan their studies and support each other. The Community features — reactions, shared tasks, quick messages, study circles, and the study map — only work if everyone feels safe. These guidelines explain what’s okay and what isn’t.',
          ],
        },
        {
          heading: 'Be kind',
          bullets: [
            'Encourage classmates, don’t tear them down.',
            'Assume good intent. If something feels off, ask before accusing.',
            'Keep jokes friendly. What reads as a joke to you can feel like bullying to someone else.',
          ],
        },
        {
          heading: 'Things you must not do',
          paragraphs: [
            'These behaviors are not allowed anywhere in Rencana and may result in your account being suspended or permanently removed:',
          ],
          bullets: [
            'Harassment, bullying, threats, or intimidation.',
            'Hate speech or discrimination based on race, ethnicity, religion, gender, gender identity, sexual orientation, disability, or similar grounds.',
            'Sexual or sexually explicit content. No content involving minors, ever.',
            'Spam, scams, phishing, unsolicited promotions, or chain messages.',
            'Impersonating other students, lecturers, universities, or Rencana staff.',
            'Content encouraging self-harm, suicide, or violence.',
            'Sharing other people’s personal information without consent.',
            'Academic dishonesty: selling answers, paying someone to complete your work, or coordinating cheating.',
          ],
        },
        {
          heading: 'Reporting content you see',
          paragraphs: [
            'If another user violates these guidelines, please tell us so we can act:',
          ],
          bullets: [
            'Open the user’s profile from Community.',
            'Tap Safety → Report.',
            'Choose a reason and add details (optional).',
            'Our team reviews every report within 24 hours.',
          ],
        },
        {
          heading: 'Blocking a user',
          paragraphs: [
            'Blocking immediately stops the other person from reacting to your activity, sending you quick messages, sharing tasks with you, or adding you as a friend. You can block anyone from Community → their profile → Safety → Block. You won’t need to explain yourself and they won’t be told.',
          ],
        },
        {
          heading: 'What we do when rules are broken',
          bullets: [
            'First, we remove or hide the offending content.',
            'Depending on severity, we warn, suspend, or permanently remove the account.',
            'Severe or repeat violations can result in a permanent ban with no appeal.',
            'In serious cases (threats of violence, content involving minors, etc.) we cooperate with law enforcement.',
          ],
        },
        {
          heading: 'Appeals',
          paragraphs: [
            `If you think your account was actioned by mistake, email ${SUPPORT_EMAIL} with your registered email and a short explanation. We’ll take a second look within a few business days.`,
          ],
        },
      ]}
      footer={[
        'Thanks for helping keep Rencana a respectful place to study.',
      ]}
    />
  );
}
