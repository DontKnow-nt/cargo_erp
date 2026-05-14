import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUsersWithPermissions } from '@/lib/actions/officecontrol';
import { GRANTABLE_PAGES } from '@/lib/permissions';
import OfficeControlPanel from './OfficeControlPanel';

const OC_TOKEN = Buffer.from(process.env.NEXTAUTH_SECRET ?? '').toString('base64').slice(0, 32);

export default async function OfficeControlPanelPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('oc_session')?.value;
  if (token !== OC_TOKEN) redirect('/officecontrol');

  const users = await getUsersWithPermissions();

  return <OfficeControlPanel users={users} grantablePages={[...GRANTABLE_PAGES]} />;
}
