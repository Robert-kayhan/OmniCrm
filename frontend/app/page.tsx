import { redirect } from 'next/navigation';

/**
 * The product has no marketing page. The inbox layout owns the auth check and
 * bounces to /login when there is no session, so this is a plain redirect
 * rather than a second place that decides who is signed in.
 */
export default function Home() {
  redirect('/inbox');
}
