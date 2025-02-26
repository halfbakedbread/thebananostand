import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { TransactionService } from '@app/services/transaction.service';
import { AppStateService } from '@app/services/app-state.service';
import { ActivatedRoute } from '@angular/router';
import { FormControl } from '@angular/forms';
import { UtilService } from '@app/services/util.service';
import * as Colors from '@brightlayer-ui/colors';
import { AccountService } from '@app/services/account.service';
import { TRANSACTION_COMPLETED_SUCCESS } from '@app/services/wallet-events.service';
import { AccountOverview } from '@app/types/AccountOverview';

@Component({
    selector: 'app-api-request-overlay',
    styleUrls: ['api-request.component.scss'],
    template: `
        <div class="api-request-overlay overlay-action-container">
            <div class="overlay-body" *ngIf="hasSuccess === true">
                <!-- TODO Make these components -->
                <app-empty-state *ngIf="isChangeAction()">
                    <mat-icon empty-icon> check_circle</mat-icon>
                    <div title>Representative Changed</div>
                    <div description>
                        Your representative has been successfully updated and can be viewed
                        <span class="link" [style.color]="colors.blue[500]" (click)="openLink()">here</span>. You can
                        now close this window.
                    </div>
                    <button mat-flat-button color="primary" (click)="closeOverlay()">Close</button>
                </app-empty-state>
                <app-empty-state *ngIf="isSendAction()">
                    <mat-icon empty-icon> check_circle</mat-icon>
                    <div title>Transaction Sent</div>
                    <div description>
                        Your transaction has been successfully sent and can be viewed
                        <span class="link" [style.color]="colors.blue[500]" (click)="openLink()">here</span>. You can
                        now close this window.
                    </div>
                    <button mat-flat-button color="primary" (click)="closeOverlay()">Close</button>
                </app-empty-state>
            </div>

            <div *ngIf="hasSuccess === false" class="overlay-body">
                <app-empty-state>
                    <mat-icon empty-icon> error</mat-icon>
                    <div title>Action Failed</div>
                    <div description>Something went wrong here.</div>
                    <button mat-flat-button color="primary" class="close-button" (click)="closeOverlay()">Close</button>
                </app-empty-state>
            </div>

            <ng-container *ngIf="hasSuccess === undefined">
                <div class="overlay-header">{{ requestType }} Request</div>
                <div class="overlay-body mat-body-1">
                    <ng-container *ngIf="activeStep === 0">
                        <ng-container *ngIf="isSendAction()">
                            <div style="margin-bottom: 8px">You have been requested to send:</div>
                            <div style="margin-bottom: 24px">{{ amountBan }} BAN</div>
                        </ng-container>
                        <div *ngIf="isChangeAction()" style="margin-bottom: 8px">
                            You have been requested to change your representative to:
                        </div>
                        <div *ngIf="isSendAction()" style="margin-bottom: 8px">To:</div>
                        <div
                            style="margin-bottom: 8px; word-break: break-all"
                            [innerHTML]="util.formatHtmlAddress(actionAddress)"
                        ></div>
                    </ng-container>
                    <ng-container *ngIf="activeStep === 1">
                        <div style="margin-bottom: 16px;" *ngIf="isSendAction()">
                            Choose which account to send Banano from.
                        </div>
                        <div style="margin-bottom: 16px;" *ngIf="isChangeAction()">Choose which account to update.</div>
                        <mat-form-field appearance="fill">
                            <mat-label>Address</mat-label>
                            <mat-select [formControl]="selectedAccount">
                                <mat-option
                                    *ngFor="let account of (state.store | async).accounts"
                                    [value]="account"
                                    [disabled]="filterAccountByBalance(account)"
                                >
                                    <div style="display: flex; justify-content: space-between; align-items: center">
                                        <div>
                                            {{ account.shortAddress }}
                                        </div>
                                        <div *ngIf="filterAccountByBalance(account)" style="font-size: 10px">
                                            (low balance)
                                        </div>
                                    </div>
                                </mat-option>
                            </mat-select>
                        </mat-form-field>
                    </ng-container>
                    <ng-container *ngIf="activeStep === 2">
                        <div style="margin-bottom: 24px">Please confirm the transaction details below:</div>
                        <ng-container *ngIf="isChangeAction()">
                            <!--
                            <div style="font-weight: 600">Update</div>
                            <div style="word-break: break-all; margin-bottom: 24px"
                                 [innerHTML]="util.formatHtmlAddress(selectedAccount.value.fullAddress)"></div> -->
                            <div style="font-weight: 600">Change Representative to</div>
                            <div
                                style="word-break: break-all"
                                [innerHTML]="util.formatHtmlAddress(actionAddress)"
                            ></div>
                        </ng-container>
                        <ng-container *ngIf="isSendAction()">
                            <div style="font-weight: 600">Send</div>
                            <div>{{ amountBan }} BAN</div>
                            <div style="font-weight: 600; margin-top: 24px;">To</div>
                            <div
                                style="word-break: break-all"
                                [innerHTML]="util.formatHtmlAddress(actionAddress)"
                            ></div>
                        </ng-container>
                    </ng-container>
                </div>

                <div class="overlay-footer">
                    <mobile-stepper [activeStep]="activeStep" [steps]="maxSteps">
                        <button
                            mat-stroked-button
                            back-button
                            color="primary"
                            (click)="back()"
                            data-cy="change-close-button"
                        >
                            <ng-container *ngIf="activeStep === 0">Close</ng-container>
                            <ng-container *ngIf="activeStep > 0">Back</ng-container>
                        </button>
                        <button
                            class="loading-button"
                            mat-flat-button
                            next-button
                            color="primary"
                            (click)="next()"
                            [disabled]="!canContinue()"
                        >
                            <ng-container *ngIf="activeStep < lastStep">Next</ng-container>
                            <ng-container *ngIf="activeStep === lastStep">
                                <div class="spinner-container" [class.isLoading]="isLoading">
                                    <mat-spinner class="primary-spinner" diameter="20"></mat-spinner>
                                </div>
                                <span *ngIf="!isLoading"> {{ isSendAction() ? 'Send' : 'Change' }} </span>
                            </ng-container>
                        </button>
                    </mobile-stepper>
                </div>
            </ng-container>
        </div>
    `,
})
export class ApiRequestComponent implements OnInit {
    @Output() close: EventEmitter<string> = new EventEmitter<string>();

    txHash: string;
    actionAddress: string;

    hasSuccess: boolean;
    isLedger: boolean;
    isLoading: boolean;

    colors = Colors;
    requestType: 'Send' | 'Change';
    selectedAccount = new FormControl<AccountOverview>(null);

    amountBan: number;
    activeStep = 0;
    maxSteps = 3;
    lastStep = this.maxSteps - 1;

    constructor(
        public util: UtilService,
        public state: AppStateService,
        private readonly _route: ActivatedRoute,
        private readonly _accountService: AccountService,
        private readonly _transactionService: TransactionService
    ) {
        this._route.queryParams.subscribe((params) => {
            if (!params || !params.address) {
                return;
            }
            this.actionAddress = params.address.toLowerCase();
            this.amountBan = params.amount;
            switch (params.request.toLowerCase()) {
                case 'send':
                    this.requestType = 'Send';
                    break;
                case 'change':
                    this.requestType = 'Change';
                    break;
                default:
                    this.closeOverlay();
            }
        });
    }

    ngOnInit(): void {}

    closeOverlay(): void {
        this.close.emit(this.txHash);
    }

    openLink(): void {
        this._accountService.showBlockInExplorer(this.txHash);
    }

    next(): void {
        if (this.activeStep === this.lastStep) {
            return this.performQueryAction();
        }
        this.activeStep++;
    }

    back(): void {
        if (this.activeStep === 0) {
            return this.closeOverlay();
        }
        this.activeStep--;
    }

    isChangeAction(): boolean {
        return this.requestType === 'Change';
    }

    isSendAction(): boolean {
        return this.requestType === 'Send';
    }

    canContinue(): boolean {
        if (this.activeStep === 1) {
            return Boolean(this.selectedAccount.value);
        }
        return true;
    }

    filterAccountByBalance(account: AccountOverview): boolean {
        if (this.isChangeAction()) {
            return false;
        }
        return account.balance <= this.amountBan;
    }

    performQueryAction(): void {
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        const selectedAccount = this.selectedAccount.value;

        if (this.isSendAction()) {
            this._transactionService
                .withdraw(this.actionAddress, this.util.convertBanToRaw(this.amountBan), selectedAccount.index)
                .then((hash) => {
                    this.txHash = hash;
                    this.hasSuccess = true;
                    this.isLoading = false;
                    TRANSACTION_COMPLETED_SUCCESS.next(hash);
                })
                .catch((err) => {
                    console.error(err);
                    this.hasSuccess = false;
                    this.isLoading = false;
                });
        } else {
            this._transactionService
                .changeRepresentative(this.actionAddress, selectedAccount.index)
                .then((hash) => {
                    this.txHash = hash;
                    this.hasSuccess = true;
                    this.isLoading = false;
                    TRANSACTION_COMPLETED_SUCCESS.next(hash);
                })
                .catch((err) => {
                    console.error(err);
                    this.hasSuccess = false;
                    this.isLoading = false;
                });
        }
    }
}
