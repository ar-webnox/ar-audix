/**
 * Every outside link shown in the app lives here. Edit this file to change them.
 * An entry with an empty `url` is not shown, so add the real address when you have it,
 * for example:  { id: 'github', label: 'GitHub', url: 'https://github.com/your-name' }
 */
export interface SocialLink {
  id: 'website' | 'github' | 'linkedin' | 'facebook' | 'instagram';
  label: string;
  url: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { id: 'website', label: 'Website', url: 'https://arwebnox.com/' },
  { id: 'github', label: 'GitHub', url: '' }, // placeholder: add your GitHub profile URL
  { id: 'linkedin', label: 'LinkedIn', url: '' }, // placeholder: add your LinkedIn profile URL
  { id: 'facebook', label: 'Facebook', url: '' }, // placeholder: add your Facebook page URL
  { id: 'instagram', label: 'Instagram', url: '' }, // placeholder: add your Instagram profile URL
];

/** The brand credit line in About. */
export const BUILT_BY = { name: 'AR WebNox', url: 'https://arwebnox.com/' };
