// SPDX-License-Identifier: GPL-2.0
package app.benthicdivelog.core

/** Access to the C++ core. The core is not reentrant: only one thread may call it. */
internal object NativeCore {
    init {
        System.loadLibrary("benthic")
    }

    external fun init(home: String)
    external fun logExists(repo: String): Boolean
    external fun countDives(log: String): Int
    external fun importFile(source: String, repo: String): Int
    external fun listDives(repo: String): String
    external fun getDive(id: Int): String
    external fun getPrefs(): String
    external fun setPrefs(changes: String)
    external fun cylinderTypes(action: String, name: String, value: String, ml: Int, mbar: Int): String
    external fun plannerSetup(): String
    external fun planDive(request: String): String
    external fun listPlans(): String
    external fun savePlan(request: String, replaceId: Int, title: String): String
    external fun setCaFile(path: String)
    external fun cloudListDives(email: String, password: String): String
    external fun cloudConfigure(email: String, password: String)
    external fun cloudListCachedDives(): String
    external fun alphaCacheList(): String
    external fun alphaCacheOpen(id: String): String
    external fun pendingChanges(): String
    external fun cloudSignOut(deleteCopy: Boolean)
    external fun editDive(id: Int, changes: String): String
    external fun undo(redo: Boolean): String
    external fun getTrip(id: Int): String
    external fun siteQuery(kind: String, uuid: Long, lat: Int, lon: Int, a: Int, b: Int, text: String): String
    external fun filterQuery(kind: String, fulltext: String, mode: String, rules: Array<String>): String
    external fun createDive(fields: String): String
    external fun deleteDive(ids: IntArray): String
    external fun renumberDives(ids: IntArray, start: Int, numbers: IntArray): String
    external fun mergeDives(ids: IntArray): String
    external fun editDives(ids: IntArray, changes: String): String
    external fun importDives(file: String, source: String): String
    external fun importCsv(file: String, companion: String, params: String, source: String, dryRun: Boolean): String
    external fun importDivesFiles(files: Array<String>, source: String): String
    external fun filterPresets(action: String, name: String, fulltext: String, mode: String, rules: Array<String>, index: Int): String
    external fun syncConflicts(): String
    external fun cancelConflictResolution()
    external fun resolveConflicts(choices: String)
    external fun statsQuery(kind: String, text: String): String
    external fun siteAction(action: String, uuid: Long, other: Long, uuids: LongArray?, field: String, value: String, lat: Int, lon: Int, country: String, region: String, county: String, city: String): String
    external fun setXsltDir(dir: String)
    external fun exportDives(ids: IntArray, format: String, anonymize: Boolean, path: String)
    external fun toolQuery(kind: String): String
    external fun tripAction(action: String, tripId: Int, diveId: Int, otherId: Int, diveIds: IntArray?, value: String): String
    external fun diveComputers(): String
    external fun diveComputerAction(action: String, model: String, serial: String, value: String, intoModel: String, intoSerial: String): String
    external fun sync(): String
    /** Receives the messages of the cloud log's git work (benthic.h, set_sync_progress); null stops them. */
    external fun setSyncListener(listener: DownloadListener?)
    external fun saveLocal()
    external fun listLoadedDives(includeInvalid: Boolean): String
    external fun setCloudTestEmail(email: String)
    external fun cloudDeleteAccount(password: String, keepDivesIn: String): String
    external fun cloudCreateAccount(email: String, password: String): String
    external fun cloudVerifyPin(email: String, password: String, pin: String): String
    external fun cloudCreateLog(importPath: String): String

    /** Own git repository: the references of the repository (benthic.h, git_check); any thread. */
    external fun gitCheck(url: String, username: String, token: String): String
    external fun gitConfigure(url: String, username: String, token: String, branch: String)
    external fun gitCreateLog(): String
    /**
     * Git on the device (bgit.h): clone, pull, commit, push, status of a working copy. Any thread, one call at a
     * time per working copy; each returns JSON or throws with the error code. `listener` gets {phase, done, total}.
     */
    external fun bgitAllowHttp(allowed: Boolean)
    external fun bgitCancel()
    external fun bgitClone(url: String, dir: String, branch: String, user: String, token: String, listener: DownloadListener?): String
    external fun bgitPull(dir: String, branch: String, user: String, token: String, authorName: String?, authorEmail: String?, listener: DownloadListener?): String
    external fun bgitCommit(dir: String, paths: Array<String>, message: String, authorName: String?, authorEmail: String?, mergeParent: String?): String
    external fun bgitPush(dir: String, branch: String, user: String, token: String, listener: DownloadListener?): String
    external fun bgitStatus(dir: String, paths: Array<String>): String
    external fun bgitUnpushed(dir: String, branch: String): String
    external fun bgitHead(dir: String, branch: String): String
    external fun bgitListFiles(dir: String, prefix: String): String
    external fun bgitWrite(dir: String, paths: Array<String>, texts: Array<String?>): String
    external fun bgitRead(dir: String, paths: Array<String>): String
    external fun bgitDiff(dir: String, from: String, to: String): String
    external fun bgitFiles(dir: String): String
    external fun history(action: String, args: Array<String>): String
    external fun bgitRemove(dir: String)

    external fun importCount(path: String): String
    external fun divelogsCheck(user: String, password: String): String
    external fun divelogsDownload(user: String, password: String, outPath: String): String

    /** The one call allowed off the core thread, even during a load (see benthic.h). */
    external fun cloudProbe(): String

    /** Dive computer of a Bluetooth name ({vendor, product} or null, as JSON); any thread. */
    external fun dcFromBluetoothName(name: String): String

    /** Models that download over Bluetooth (JSON); any thread. */
    external fun dcBluetoothModels(): String

    /** Blocks for the whole download (download_dives in benthic.h); on the core thread. */
    external fun downloadDives(request: String, transport: BluetoothTransport, listener: DownloadListener): String

    /** Dives received before a failure: "count", "keep" (one undoable step) or "discard"; on the core thread. */
    external fun downloadPartial(action: String): String

    /** Asks the running download to stop; from any thread. */
    external fun downloadCancel()
}

/** Progress of a download, called on the core thread (see download_progress in benthic.h). */
internal fun interface DownloadListener {
    fun onProgress(json: String)
}
