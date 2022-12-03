import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { LocalStorageWallet, WalletStorageService } from '@app/services/wallet-storage.service';
import { AppStateService, AppStore } from '@app/services/app-state.service';
import { UtilService } from '@app/services/util.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SecretService } from '@app/services/secret.service';
import { AccountService } from '@app/services/account.service';
import { TransactionService } from '@app/services/transaction.service';

const duration = 3000;
const closeActionText = 'Dismiss';

/** User has attempted to unlock an encrypted secret wallet using a password. */
export const ATTEMPT_UNLOCK_WALLET_WITH_PASSWORD = new Subject<{ password: string }>();

/** User has provided an incorrect password to unlock the wallet. */
export const PROVIDED_INCORRECT_PASSWORD = new Subject<void>();

/** User wants to unlock the ledger device. */
export const ATTEMPT_UNLOCK_LEDGER_WALLET = new Subject<void>();

/** User ran into an issue connection their ledger. */
export const EMIT_LEDGER_CONNECTION_ERROR = new Subject<{ error: string }>();

/** A wallet (either secret or ledger) has been unlocked. */
export const UNLOCK_WALLET = new Subject<{ isLedger: boolean; password: string }>();

/** A wallet (previously unlocked) has been effectively logged out with no remaining secrets known. */
export const LOCK_WALLET = new Subject<void>();

/** A new secret has been provided, can be either a seed or mnemonic. */
export const IMPORT_NEW_WALLET_FROM_SECRET = new Subject<{ secret: string; password: string }>();

/** The actively displayed wallet on the dashboard has changed. */
export const CHANGE_ACTIVE_WALLET = new Subject<LocalStorageWallet>();

/** User has request next sequential index be added to the dashboard. */
export const ADD_NEXT_ACCOUNT_BY_INDEX = new Subject<void>();

/** New addresses (index) has been added to the dashboard. */
export const ADD_SPECIFIC_ACCOUNTS_BY_INDEX = new Subject<number[]>();

/** An address (index) has been removed from the dashboard. */
export const REMOVE_ACCOUNTS_BY_INDEX = new Subject<number[]>();

/** An account is being added to the dashboard. Can be either true or false. */
export const SET_DASHBOARD_ACCOUNT_LOADING = new BehaviorSubject<boolean>(true);

/** User has requested that all loaded indexes be refreshed, checking for receivable transactions and updating account balances. */
export const REFRESH_DASHBOARD_ACCOUNTS = new Subject<void>();

/** The active wallet has been removed. */
export const REMOVE_ACTIVE_WALLET = new Subject<void>();

/** The active wallet has been given an alias. */
export const RENAME_ACTIVE_WALLET = new Subject<string>();

/** Update active wallet password */
export const REENCRYPT_ACTIVE_WALLET = new Subject<LocalStorageWallet>();

/** Backup active wallet seed to clipboard  */
export const COPY_SECRET_TO_CLIPBOARD = new Subject<{ seed: string; openSnackbar: boolean }>();

/** Backup active wallet Mnemonic Phrase to clipboard */
export const COPY_MNEMONIC_TO_CLIPBOARD = new Subject<{ mnemonic: string; openSnackbar: boolean }>();

/** User has copied account address to clipboard. */
export const COPY_ADDRESS_TO_CLIPBOARD = new Subject<{ address: string }>();

/** User has opted to delete all locally stored info. */
export const REMOVE_ALL_WALLET_DATA = new Subject<void>();

@Injectable({
    providedIn: 'root',
})
export class WalletEventsService {
    store: AppStore;

    constructor(
        private readonly _util: UtilService,
        private readonly _snackbar: MatSnackBar,
        private readonly _secretService: SecretService,
        private readonly _accountService: AccountService,
        private readonly _appStateService: AppStateService,
        private readonly _transactionService: TransactionService,
        private readonly _walletStorageService: WalletStorageService
    ) {
        // _dispatch initial app state
        this._dispatch({
            hasSecret: this._walletStorageService.hasSecretWalletSaved(),
            activeWallet: this._walletStorageService.readActiveWalletFromLocalStorage(),
            localStorageWallets: this._walletStorageService.readWalletsFromLocalStorage(),
        });

        this._appStateService.store.subscribe((store) => {
            this.store = store;
        });

        // Listening for events
        ATTEMPT_UNLOCK_WALLET_WITH_PASSWORD.subscribe(async (data) => {
            try {
                await this._secretService.unlockSecretWallet(data.password);
                UNLOCK_WALLET.next({
                    isLedger: false,
                    password: data.password,
                });
            } catch (err) {
                console.error(err);
                PROVIDED_INCORRECT_PASSWORD.next();
            }
        });

        UNLOCK_WALLET.subscribe((data) => {
            this._dispatch({
                hasUnlockedSecret: !data.isLedger,
                hasUnlockedLedger: data.isLedger,
                walletPassword: data.password,
            });

            void this._accountService.fetchOnlineRepresentatives().then((onlineRepresentatives) => {
                this._appStateService.onlineRepresentatives = onlineRepresentatives;
            });
            void this._accountService.fetchKnownAccounts().then((knownAccounts) => {
                this._appStateService.knownAccounts = knownAccounts;
            });

            REFRESH_DASHBOARD_ACCOUNTS.next();
        });

        LOCK_WALLET.subscribe(() => {
            this._dispatch({
                hasUnlockedLedger: false,
                hasUnlockedSecret: false,
                walletPassword: undefined,
            });
        });

        ATTEMPT_UNLOCK_LEDGER_WALLET.subscribe(async () => {
            try {
                await this._transactionService.checkLedgerOrError();
                this._dispatch({ hasUnlockedLedger: true });
            } catch (err) {
                EMIT_LEDGER_CONNECTION_ERROR.next({ error: err });
            }
        });

        COPY_SECRET_TO_CLIPBOARD.subscribe((data: { seed: string; openSnackbar: boolean }) => {
            this._util.clipboardCopy(data.seed);
            if (data.openSnackbar) {
                this._snackbar.open('Wallet Seed Copied!', closeActionText, { duration });
            }
        });

        COPY_MNEMONIC_TO_CLIPBOARD.subscribe((data: { mnemonic: string; openSnackbar: boolean }) => {
            this._util.clipboardCopy(data.mnemonic);
            if (data.openSnackbar) {
                this._snackbar.open('Wallet Mnemonic Phrase Copied!', closeActionText, { duration });
            }
        });

        COPY_ADDRESS_TO_CLIPBOARD.subscribe((data: { address: string }) => {
            this._util.clipboardCopy(data.address);
            if (data.address) {
                this._snackbar.open('Address Copied!', closeActionText, { duration });
            }
        });

        REMOVE_ACTIVE_WALLET.subscribe(() => {
            this._snackbar.open('Removed Wallet', closeActionText, { duration });
        });

        REMOVE_ALL_WALLET_DATA.subscribe(() => {
            localStorage.clear();
            this._snackbar.open('All Wallets Removed!', closeActionText, { duration });
            this._dispatch({
                hasSecret: false,
                localStorageWallets: [],
                activeWallet: undefined,
            });
            LOCK_WALLET.next();
        });

        SET_DASHBOARD_ACCOUNT_LOADING.subscribe((isLoading) => {
            this._dispatch({ isLoadingAccounts: isLoading });
        });

        IMPORT_NEW_WALLET_FROM_SECRET.subscribe(async (data): Promise<void> => {
            const password = this.store.hasUnlockedSecret ? this.store.walletPassword : data.password;
            const encryptedSecret = await this._secretService.storeSecret(data.secret, password);
            this._dispatch({
                hasSecret: true,
                hasUnlockedSecret: true,
            });
            const wallet = this._walletStorageService.createLocalStorageWallet(encryptedSecret);
            this._walletStorageService.writeActiveWalletToLocalStorage(wallet);
            CHANGE_ACTIVE_WALLET.next(wallet);
        });

        CHANGE_ACTIVE_WALLET.subscribe((activeWallet: LocalStorageWallet) => {
            this._walletStorageService.writeActiveWalletIdToLocalStorage(activeWallet);
            this._dispatch({ activeWallet });
            REFRESH_DASHBOARD_ACCOUNTS.next();
        });

        REFRESH_DASHBOARD_ACCOUNTS.subscribe(() => {
            this._dispatch({ accounts: [], isLoadingAccounts: true, totalBalance: 0 });
            const indexes = this.store.activeWallet.loadedIndexes;
            if (indexes.length === 0) {
                indexes.push(0);
            }
            ADD_SPECIFIC_ACCOUNTS_BY_INDEX.next(indexes);
        });

        ADD_NEXT_ACCOUNT_BY_INDEX.subscribe(() => {
            const nextIndex = this._accountService.findNextUnloadedIndex();
            ADD_SPECIFIC_ACCOUNTS_BY_INDEX.next([nextIndex]);
        });

        ADD_SPECIFIC_ACCOUNTS_BY_INDEX.subscribe(async (indexes: number[]) => {
            const accounts = this.store.accounts;
            this._dispatch({ isLoadingAccounts: true });
            let totalBalance = this.store.totalBalance;
            for await (const index of indexes) {
                const account = await this._accountService.fetchAccount(index);
                accounts.push(account);
                totalBalance += account.balance;
                this._dispatch({ totalBalance });
            }
            this._dispatch({ accounts, isLoadingAccounts: false });
        });

        REMOVE_ACCOUNTS_BY_INDEX.subscribe((indexes: number[]) => {
            const accounts = this._accountService.removeAccounts(indexes);
            this._dispatch({ accounts });
        });
    }

    /** Broadcasts an updated app state. */
    private _dispatch(newData: Partial<AppStore>): void {
        this._appStateService.store.next(Object.assign(this._appStateService.store.getValue(), newData));
    }
}
