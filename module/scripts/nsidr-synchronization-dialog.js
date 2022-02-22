/*const KEYCLOAK_URL = "http://localhost:8081/auth";
const KEYCLOAK_REALM = "wildlive-portal";
const KEYCLOAK_CLIENT_ID = "test-openrefine";
*/
const KEYCLOAK_URL = "https://login-demo.dissco.eu/auth";
const KEYCLOAK_REALM = "SynthesysPlus";
const KEYCLOAK_CLIENT_ID = "cordra";

console.log("logidoic");

const NsidrSynchronizationDialog = {};
let wasReconciledThisSession = false;
let syncStatesResultData = null;

const initOptions = {
	url: KEYCLOAK_URL,
	realm: KEYCLOAK_REALM,
	clientId: KEYCLOAK_CLIENT_ID,
};

const keycloak = Keycloak(initOptions);
// Init part, like in the documentation
keycloak
	.init({ onLoad: initOptions.onLoad })
	.then((auth) => {
		console.log("keycloak init finished, auth", auth);
		if (auth) {
			console.log(keycloak.tokenParsed);
			console.log(keycloak.token);
			setInterval(() => {
				keycloak
					.updateToken(30) // minimum validity of token should be 30 seconds otherwise refresh
					.then((refreshed) => {
						if (refreshed) {
							console.log(
								'Token refreshed' + refreshed,
								'will update $cordraClient with new token:',
								keycloak.token
							);
						} else {
							console.log("token valid for " + Math.round(keycloak.tokenParsed.exp + keycloak.timeSkew - new Date().getTime() / 1000) + ' seconds')

						}
					})
					.catch(() => {
						console.log('Failed to refresh token');
					});
			}, 20000); // intervall every 20 seconds

		}
	})

NsidrSynchronizationDialog._updateTableRowsWithSyncStates = function() {
	$(".dissco-extension-element").remove();
	$(".data-table-header > tr").prepend('<th class="column-header dissco-extension-element">Nsidr.org status</td>');

	const rows = $(".data-table > tr");
	rows.prepend(function(i) {
		let html = '<td class="dissco-extension-element" style="background-color:';
		const syncState = syncStatesResultData[i];
		switch (syncState.syncStatus) {
			case 'synchronized':
				html += '#d4edda';
				break;
			case 'new':
				html += '#cce5ff';
				break;
			case 'error':
				html += 'red';
				break;
			case 'change':
				html += '#fff3cd';
				break;
			default:
				html += 'gray';
		}
		html += '">' + syncState.syncStatus + "</td>";
		return html;
	});
}

NsidrSynchronizationDialog.launch = function() {
	const frame = $(DOM.loadHTML("nsidr", "scripts/dialogs/nsidr-synchronization-dialog.html"));
	const elmts = this.elmts = DOM.bind(frame);

	if (keycloak.authenticated) {
		elmts.loggedInText.text("You are currently logged in as " + keycloak.tokenParsed.preferred_username);
		elmts.loginLink.attr("href", keycloak.createLogoutUrl());
		elmts.loginLink.text("Logout");
		elmts.synchronizationInfoText.text("You must run the Pre-Sync process before synchronization. This will compare your local data with the data at nsidr.org and list the differences for you to approve before synchronization");
		elmts.preSyncButton.attr("disabled", false);
		elmts.preSyncButton.removeClass("button-disabled");
	} else {
		elmts.synchronizationInfoText.text("You must login in order to start the synchronization process");
		elmts.loginLink.attr("href", keycloak.createLoginUrl());
		elmts.loginLink.text("Login");
	}

	const level = DialogSystem.showDialog(frame);

	const schema = theProject.overlayModels.disscoSchema
	if (schema && schema.columnMapping) {
		Refine.postProcess(
			"nsidr",
			"preview-digital-specimens",
			{},
			{
				columnMapping: JSON.stringify(schema.columnMapping),
				limit: 1
			},
			{},
			{
				onDone: function(data) {
					$("#ods-mapping-dialog-preview").text(JSON.stringify(data, null, 2));
				},
				onError: function(e) {
					console.log("preview-digital-specimens on error!");
				},
			}
		);
	} else {
		$("#ods-mapping-dialog-preview").text("Error: No saved schema found");
	}

	elmts.closeButton.click(function() {
		DialogSystem.dismissUntil(level - 1);
	});

	elmts.preSyncButton.click(function() {
		Refine.postProcess(
			"nsidr",
			"prepare-for-synchronization",
			{},
			{
				token: keycloak.token
			},
			{
				rowsChanged: true
			},
			{
				onDone: function(data) {
					if (data.code === "ok") {
						wasReconciledThisSession = true;
						syncStatesResultData = data.results;

						let inSyncCount = 0;
						let newCount = 0;
						let updateCount = 0;
						//To-Do: handle error for object
						const iKeys = Object.keys(syncStatesResultData);
						iKeys.forEach(function(iKey) {
							if (syncStatesResultData[iKey].syncStatus === "synchronized") {
								inSyncCount += 1;
							} else if (syncStatesResultData[iKey].syncStatus === "new") {
								newCount += 1;
							} else if (syncStatesResultData[iKey].syncStatus === "change") {
								updateCount += 1;
							}
						});

						elmts.synchronizationInfoText.text(`Ready for syncing: ${inSyncCount} objects are in sync, will upload ${newCount} new objects to nsidr.org, found ${updateCount} objects with changes - please revise these changes carefully, if you synchronize the remote objects will be overwritten with your local data`);
						elmts.syncButton.attr("disabled", false);
						elmts.syncButton.removeClass("button-disabled");
					}
				},
				onFinallyDone: function() {
					// this callback does not receive the data
					NsidrSynchronizationDialog._updateTableRowsWithSyncStates();
				},
				onError: function(e) {
					console.log("preview-digital-specimens on error!");
				},
			}
		);
	});

	elmts.syncButton.click(function() {
		Refine.postProcess(
			"nsidr",
			"perform-nsidr-edits",
			{},
			{
				token: keycloak.token
			},
			{
				rowsChanged: true
			},
			{
				onDone: function(data) {
					if (data.code === "ok") {
						syncStatesResultData = data.results;

						let inSyncCount = 0;
						let errorCount = 0;
						const iKeys = Object.keys(syncStatesResultData);
						iKeys.forEach(function(iKey) {
							if (syncStatesResultData[iKey].syncStatus === "synchronized") {
								inSyncCount += 1;
							} else if (syncStatesResultData[iKey].syncStatus === "error") {
								errorCount += 1;
							}
						});

						elmts.synchronizationInfoText.text(`Synchronization result: ${inSyncCount} objects are synchronized, ${errorCount} objects had an error during synchronization}`);
					}
				},
				onFinallyDone: function() {
					// this callback does not receive the data
					NsidrSynchronizationDialog._updateTableRowsWithSyncStates();
				},
				onError: function(e) {
					console.log("perform-nsidr-edits on error!");
				},
			}
		);
	});
};
