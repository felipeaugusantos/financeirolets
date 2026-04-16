

# Plan: Address Remaining Kaique Feedback Items

## Already Done (No Action Needed)
- Categories "Serviços Terceirizados" and "Taxa de Funcionamento" -- already in DB
- All units created (7 total)
- All bank accounts created, test ones deactivated
- Bug fixes (delete, timezone, rateio) -- applied in previous session

## Remaining Items to Address

### 1. Inline Category Creation Error
**Issue**: Kaique tried to add a category from within the transaction form and got an error.
**Root cause**: The `SelectWithAdd` component's `onAdd` for categories passes `{ name, type, active }` to `createCategory`. The `categories` table requires `type` (enum: receita/despesa) -- this is correctly passed from the transaction type. However, `sort_order` defaults to 0, and there may be a missing field issue. Need to verify error handling and ensure the inline add dialog properly shows errors via toast.
**Fix**: Improve error handling in SelectWithAdd `onAdd` callbacks to surface the actual error message. The `useSupabaseCrud.create()` already shows a toast on error, so likely the issue was transient or RLS-related (already confirmed user is admin).

### 2. CSV Import "Nothing Happens" on Click
**Issue**: Clicking "Importar CSV" and "Banco de Dados" buttons does nothing.
**Root cause**: The `ImportExportSettings` page is nested inside SettingsPage and requires clicking the "Importar / Exportar" card first. The user may have expected direct import buttons on the main settings page or elsewhere. Also, the file input uses a hidden `<input>` triggered by button click -- this should work, but may have issues on mobile Safari/iOS.
**Fix**: 
- Add `capture` attribute for mobile compatibility on file input
- Ensure the file picker opens correctly on iOS/mobile browsers
- Consider adding a direct import/export shortcut accessible from the transactions page

### 3. "Frentes de Negócio" Clarification
**Answer**: Frentes are optional. For Franqueadora, the user can leave it blank or create a generic "Institucional/Administrativo" front. No code change needed -- just confirmation.

## Files to Edit

| File | Change |
|------|--------|
| `src/pages/settings/ImportExportSettings.tsx` | Fix mobile file input compatibility, add better feedback when file picker is cancelled |
| `src/components/ui/select-with-add.tsx` | Improve error surfacing in onAdd callback |

## Technical Details

```text
1. File input mobile fix:
   - Add accept=".csv,text/csv" explicitly
   - Use onClick handler with setTimeout for iOS Safari compatibility

2. SelectWithAdd error handling:
   - The onAdd already returns null on error
   - useSupabaseCrud.create() already shows toast
   - Verify no silent failures
```

