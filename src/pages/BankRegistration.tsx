import AccountsSettings from './settings/AccountsSettings';

/** Conciliação Bancária → Cadastro de banco. */
export default function BankRegistration() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-card-foreground">Cadastro de banco</h1>
        <p className="text-sm text-muted-foreground">
          Contas bancárias, saldo inicial com data-base e identificação da conta no arquivo OFX.
        </p>
      </div>
      <AccountsSettings />
    </div>
  );
}
