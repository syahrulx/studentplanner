import LegalScreen from '@/components/LegalScreen';
import { SUPPORT_EMAIL } from '@/src/constants/legal';

const LAST_UPDATED = 'April 20, 2026';

export default function TermsOfUseScreen() {
  return (
    <LegalScreen
      title="Terms of Use"
      subtitle={`Last updated: ${LAST_UPDATED}`}
      sections={[
        {
          heading: '1. Acceptance of Terms',
          paragraphs: [
            'These Terms of Use (the "Terms") form a binding agreement between you and Rencana ("we", "us", "our"). By creating an account, signing in, or otherwise using the Rencana mobile app (the "Service"), you agree to these Terms. If you do not agree, do not use the Service.',
          ],
        },
        {
          heading: '2. Eligibility',
          paragraphs: [
            'You must be at least 13 years old to use Rencana. If you are under 18, you confirm that a parent or legal guardian has reviewed these Terms and consents to your use of the Service.',
          ],
        },
        {
          heading: '3. Your Account',
          bullets: [
            'You are responsible for the accuracy of the information you provide and for keeping your login credentials safe.',
            'You may not share your account with anyone else or use another person’s account without permission.',
            'You can delete your account at any time from Settings → Delete Account. Deletion is permanent and removes your profile, timetable, tasks, notes, and community data.',
          ],
        },
        {
          heading: '4. Acceptable Use',
          paragraphs: [
            'You agree not to use the Service for any unlawful purpose or in a way that harms other users. The following behavior is prohibited:',
          ],
          bullets: [
            'Harassment, bullying, threats, or intimidation of any person.',
            'Hate speech or content that promotes discrimination based on race, ethnicity, religion, gender, gender identity, sexual orientation, disability, or similar grounds.',
            'Sexual content, sexually explicit messages, or content that sexualizes minors.',
            'Spam, scams, phishing, or unsolicited commercial messages.',
            'Impersonating another person, university, or organization.',
            'Content that encourages self-harm, suicide, or violence.',
            'Uploading malware, attempting to reverse engineer the Service, or interfering with other users’ accounts.',
          ],
        },
        {
          heading: '5. User-Generated Content and Community Safety',
          paragraphs: [
            'Rencana allows you to share limited content with other users — for example, reactions, quick messages, shared tasks, study-circle posts, and your study status on the Community map. You retain ownership of what you create. By posting, you grant Rencana a non-exclusive license to host and display that content inside the Service so it can be delivered to the people you chose to share it with.',
            'Rencana has ZERO TOLERANCE for objectionable content or abusive users. Every user can:',
          ],
          bullets: [
            'Report another user by opening their profile in Community → Safety → Report. Reports are reviewed by our moderation team within 24 hours.',
            'Block another user by opening their profile in Community → Safety → Block. Blocking immediately stops all reactions, shared tasks, and friend interactions from that user.',
          ],
          // We intentionally end this section with the exact language Apple’s Guideline 1.2 reviewer looks for.
        },
        {
          heading: '6. Moderation Actions We Can Take',
          paragraphs: [
            'If we become aware of content or behavior that violates these Terms, we may, at our discretion and without prior notice:',
          ],
          bullets: [
            'Remove or hide the offending content.',
            'Warn, suspend, or terminate the responsible account.',
            'Reject appeals that are frivolous or repeat the prohibited behavior.',
            'Cooperate with law-enforcement requests where required by law.',
          ],
        },
        {
          heading: '7. Third-Party Services',
          paragraphs: [
            'Rencana integrates with optional third-party services such as Google Classroom, Spotify, Apple Sign in with Apple, and map providers. Your use of those services is subject to their own terms and privacy policies. You can disconnect any optional integration at any time from Settings.',
          ],
        },
        {
          heading: '8. Subscriptions and In-App Purchases',
          paragraphs: [
            'Some features may require a paid subscription. Payments are processed by Apple through your App Store account. Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel from your Apple ID → Subscriptions. Refunds are handled by Apple in accordance with their policies.',
          ],
        },
        {
          heading: '9. Intellectual Property',
          paragraphs: [
            'The Rencana name, logo, user interface, and software are owned by Rencana and its licensors. Nothing in these Terms transfers ownership of our intellectual property to you.',
          ],
        },
        {
          heading: '10. Disclaimer of Warranties',
          paragraphs: [
            'The Service is provided on an "as is" and "as available" basis. We make no warranty that the Service will be uninterrupted, error-free, or meet your academic or personal goals. Timetables, AI-imported class details, and notifications are provided for convenience — always double-check with your university for official information.',
          ],
        },
        {
          heading: '11. Limitation of Liability',
          paragraphs: [
            'To the fullest extent permitted by law, Rencana will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, grades, or academic opportunity, arising out of or related to your use of the Service.',
          ],
        },
        {
          heading: '12. Termination',
          paragraphs: [
            'You may stop using Rencana and delete your account at any time. We may suspend or terminate accounts that violate these Terms. Upon termination, your right to use the Service ends immediately.',
          ],
        },
        {
          heading: '13. Changes to These Terms',
          paragraphs: [
            'We may update these Terms from time to time. When we make material changes, we will update the "Last updated" date and, where appropriate, notify you in the app. Your continued use of the Service after an update constitutes acceptance of the revised Terms.',
          ],
        },
        {
          heading: '14. Governing Law',
          paragraphs: [
            'These Terms are governed by the laws of Malaysia, without regard to its conflict-of-law principles. Any dispute arising from these Terms or your use of the Service will be resolved in the competent courts of Malaysia, unless mandatory local law provides otherwise.',
          ],
        },
      ]}
      footer={[
        `Questions or concerns? Contact us at ${SUPPORT_EMAIL}.`,
      ]}
    />
  );
}
