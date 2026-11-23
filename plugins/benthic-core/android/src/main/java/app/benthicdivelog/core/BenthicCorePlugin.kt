// SPDX-License-Identifier: GPL-2.0
package app.benthicdivelog.core

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.view.WindowManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Bluetooth permissions, asked when the diver opens the download (never at
 * start): Android 12 and later, "Nearby devices" (scan, never used for
 * location, and connect); before, the location, without which Android
 * finds no Bluetooth Low Energy device.
 */
@CapacitorPlugin(
    name = "BenthicCore",
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT], alias = "bluetooth"),
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "bluetoothLocation"),
    ],
)
class BenthicCorePlugin : Plugin() {
    private val coreThread: ExecutorService = Executors.newSingleThreadExecutor()

    /** Network only (probeCloud): runs while the core thread loads the log. */
    private val networkThread: ExecutorService = Executors.newSingleThreadExecutor()
    private val repoDir: File by lazy { File(context.filesDir, "carnet") }
    private val repo: String by lazy { "${repoDir.absolutePath}[main]" }
    private val credentialStore: CredentialStore by lazy { CredentialStore(context) }

    /** The user's own git repository, instead of the cloud account (see GitRemoteStore). */
    private val gitStore: GitRemoteStore by lazy { GitRemoteStore(context) }

    /** The Benthic server's session (release edition), see ServerSessionStore. */
    private val serverStore: ServerSessionStore by lazy { ServerSessionStore(context) }
    private val dataKeyFile: SealedFile by lazy { SealedFile(context, "benthic-data-key", "data-key.bin", legacyAlias = "opendives-data-key") }

    /**
     * An account being created or signed in to whose logbook does not exist
     * yet: kept in memory only, and stored once its logbook is created.
     */
    private var pendingAccount: Pair<String, String>? = null

    /**
     * Released once the system certificate authorities and the XSLT stylesheets
     * are set up. Calls that can reach the network wait for
     * it; the ones that start the logbook (see onCoreThread) do not, so that
     * the log is read while this work runs on its own thread.
     */
    private val setupDone = CountDownLatch(1)
    private val setupThread: ExecutorService = Executors.newSingleThreadExecutor()

    override fun load() {
        CrashReporter.install(context)
        // A file shared with the app before the web layer was up (cold start from « Share to »).
        offerSharedFiles(activity?.intent)
        // Staged files a killed app left behind (a logbook can be 100 MB): those older than half a day go.
        Thread {
            val limit = System.currentTimeMillis() - 12L * 3600 * 1000
            context.cacheDir.listFiles { f -> f.isFile && f.name.startsWith(IMPORT_PREFIX) && f.lastModified() < limit }?.forEach { it.delete() }
        }.start()
        // The regions of the removed offline maps: their files and notification channel go.
        Thread { LegacyOfflineMaps.remove(context) }.start()
        val home = context.filesDir.absolutePath
        val caFile = File(context.cacheDir, "cacerts.pem")
        coreThread.execute {
            NativeCore.init(home)
            // The messages of the cloud log's git work, while it syncs: "syncProgress" events ({message}).
            NativeCore.setSyncListener { message -> notifyListeners("syncProgress", JSObject().put("message", message)) }
            setupThread.execute {
                val start = System.currentTimeMillis()
                // The file of the last start is used at once: reading Android's store
                // takes about half a second, which the start cannot wait for.
                val cached = caFile.length() > 0
                try {
                    try {
                        if (!cached) exportSystemCertificates(caFile)
                        NativeCore.setCaFile(withDevAuthority(caFile).absolutePath)
                    } catch (e: Exception) {
                        Log.e(TAG, "Cannot export the certificate authorities", e)
                    }
                    try {
                        // Subsurface's XSLT stylesheets (exports), copied once per app version.
                        val dir = File(context.filesDir, XSLT_DIR)
                        val version = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime
                        if (!dir.exists() || dir.lastModified() < version) {
                            dir.mkdirs()
                            for (name in context.assets.list(XSLT_DIR).orEmpty()) {
                                context.assets.open("$XSLT_DIR/$name").use { input -> File(dir, name).outputStream().use { input.copyTo(it) } }
                            }
                            dir.setLastModified(System.currentTimeMillis())
                        }
                        NativeCore.setXsltDir(dir.absolutePath)
                    } catch (e: Exception) {
                        Log.e(TAG, "Cannot install the XSLT stylesheets", e)
                    }
                } finally {
                    setupDone.countDown()
                    Log.i(TAG, "perf: certificates and stylesheets set up in ${System.currentTimeMillis() - start} ms (file kept: $cached)")
                }
                if (cached) {
                    // A system update or an authority installed by the diver changes the
                    // list: checked once the start is over, the new file used from then on.
                    try {
                        Thread.sleep(CERTIFICATES_RECHECK_MS)
                        val count = exportSystemCertificates(caFile)
                        if (count >= 0) {
                            NativeCore.setCaFile(withDevAuthority(caFile).absolutePath)
                            Log.i(TAG, "$count system certificate authorities exported")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Cannot export the certificate authorities", e)
                    }
                }
            }
        }
    }

    @PluginMethod
    fun importSample(call: PluginCall) = onCoreThread(call) {
        val sample = File(context.cacheDir, SAMPLE_ASSET)
        context.assets.open(SAMPLE_ASSET).use { input ->
            sample.outputStream().use { output -> input.copyTo(output) }
        }
        val count = NativeCore.importFile(sample.absolutePath, repo)
        sample.delete()
        Log.i(TAG, "importSample: $count dives saved to $repo")
        call.resolve(JSObject().put("count", count))
    }

    /**
     * The JSON made by the core is passed on as a string and parsed once, in
     * JavaScript: parsing it into JSObject here, then serialising it again
     * for the bridge, took a large part of the loading time.
     */
    @PluginMethod
    fun listDives(call: PluginCall) = onCoreThread(call) {
        val start = System.currentTimeMillis()
        val exists = NativeCore.logExists(repo)
        val json = if (exists) NativeCore.listDives(repo) else "[]"
        Log.i(TAG, "listDives: exists=$exists, ${json.length} chars from $repo, ${System.currentTimeMillis() - start} ms")
        call.resolve(JSObject().put("exists", exists).put("json", json))
    }

    /** Detail of one dive of the loaded log; `id` comes from listDives or listCloudDives. */
    @PluginMethod
    fun getDive(call: PluginCall) = onCoreThread(call) {
        val id = call.getInt("id")
        if (id == null) {
            call.reject("Missing dive id", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject(NativeCore.getDive(id)))
    }

    /** Planner settings as the core's preferences hold them (plan.cpp). */
    @PluginMethod
    fun plannerSetup(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.plannerSetup()))
    }

    /** Runs the core's planner; read only (see benthic.h, plan_dive). */
    @PluginMethod
    fun planDive(call: PluginCall) = onCoreThread(call) {
        val request = call.getObject("request")
        if (request == null) {
            call.reject("Missing plan request", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.planDive(request.toString())))
    }

    /** The core's preferences shown in Settings (see get_prefs in benthic.h). */
    @PluginMethod
    fun getPrefs(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        call.resolve(JSObject().put("json", NativeCore.getPrefs()))
    }

    /** Sets core preferences; `changes` is the flat JSON object of set_prefs(). */
    @PluginMethod
    fun setPrefs(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        val changes = call.getObject("changes")
        if (changes == null) {
            call.reject("Missing changes", "BAD_ARGUMENT")
            return@onCoreThread
        }
        NativeCore.setPrefs(changes.toString())
        call.resolve()
    }

    /** Cylinder types of Settings: list, library, added (the diver's own types, from the cylinder-types files), defaults (the common sizes), add, size, remove, rename, delete (see benthic.h). */
    @PluginMethod
    fun cylinderTypes(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        val json = NativeCore.cylinderTypes(
            call.getString("action").orEmpty(),
            call.getString("name").orEmpty(),
            call.getString("value").orEmpty(),
            call.getInt("ml") ?: 0,
            call.getInt("mbar") ?: 0,
        )
        call.resolve(JSObject().put("json", json))
    }


    /**
     * The Subsurface cloud account of this device: the one signed in to
     * (Android Keystore, see CredentialStore), or, for development, the
     * credentials of files/cloud-dev.env copied with adb (see app/README.md).
     * They are neither in the APK nor logged.
     *
     * configureCloud() sets the account, without network. Then probeCloud()
     * (server's head, network only) and listCloudDives({cached: true}) (the
     * device's copy, no network) can run at the same time.
     */
    @PluginMethod
    fun configureCloud(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        // The user's own git repository, when one was connected: it takes the
        // place of the cloud account. `email` is then the user name there.
        val remote = gitStore.read()
        if (remote != null) {
            try {
                NativeCore.gitConfigure(remote.url.substringBeforeLast('['), remote.username, remote.token, remote.branch)
                call.resolve(
                    JSObject().put("available", true).put("email", remote.username).put("mode", "git")
                        .put("repository", remote.url.substringBeforeLast('[').substringAfter("://")),
                )
                return@onCoreThread
            } catch (e: IllegalStateException) {
                Log.w(TAG, "The stored repository cannot be used: ${e.message}")
            }
        }
        val credentials = accountCredentials()
        if (credentials != null) NativeCore.cloudConfigure(credentials.first, credentials.second)
        // Write lock (docs/editing-and-sync-plan.md, section 4): writing to the
        // cloud is allowed only for the test account named in files/cloud-test.env.
        NativeCore.setCloudTestEmail(readTestEmail())
        // The account email is shown on the Account screen; the password never leaves the plugin.
        call.resolve(JSObject().put("available", credentials != null).put("email", credentials?.first ?: ""))
    }

    @PluginMethod
    fun probeCloud(call: PluginCall) {
        networkThread.execute {
            try {
                setupDone.await()
                val start = System.currentTimeMillis()
                val json = NativeCore.cloudProbe()
                val steps = JSObject(json)
                Log.i(
                    TAG,
                    "probeCloud: ${System.currentTimeMillis() - start} ms " +
                        "(connect ${steps.optLong("connectMs")} ms, list ${steps.optLong("listMs")} ms)",
                )
                call.resolve(JSObject().put("json", json))
            } catch (e: Exception) {
                Log.e(TAG, "Cloud probe error", e)
                call.reject(e.message, "CORE_ERROR", e)
            }
        }
    }

    /**
     * `cached: true` reads the device's copy only, without network (after
     * configureCloud); `json` is then empty when there is no copy yet.
     * Otherwise syncs with the server, then reads the log.
     */
    @PluginMethod
    fun listCloudDives(call: PluginCall) = onCoreThread(call, afterSetup = call.getBoolean("cached", false) != true) {
        val cached = call.getBoolean("cached", false) == true
        val start = System.currentTimeMillis()
        val json = if (cached) {
            NativeCore.cloudListCachedDives()
        } else {
            if (gitStore.read() != null) {
                // Own git repository, set by configureCloud: the arguments are ignored.
                NativeCore.cloudListDives("", "")
            } else {
                val credentials = accountCredentials()
                if (credentials == null) {
                    call.resolve(JSObject().put("available", false))
                    return@onCoreThread
                }
                NativeCore.cloudListDives(credentials.first, credentials.second)
            }
        }
        Log.i(TAG, "listCloudDives(cached=$cached): ${json.length} chars, ${System.currentTimeMillis() - start} ms")
        call.resolve(JSObject().put("available", true).put("json", json))
    }

    /**
     * The previous version's cloud cache (`<files>/.subsurface/cloudstorage/<folder>`), read-only, without network or
     * credentials. action "list": the folders (id, branch, bytes, modified, dives); action "open" (id): loads that
     * folder's logbook into the core, as a log without address, and returns its dives.
     */
    @PluginMethod
    fun alphaCache(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        val json = when (call.getString("action", "list")) {
            "open" -> NativeCore.alphaCacheOpen(call.getString("id", "") ?: "")
            else -> NativeCore.alphaCacheList()
        }
        call.resolve(JSObject().put("json", json))
    }

    /**
     * The versions of the configured logbook (benthic.h, history_call): options `action` ("info", "log", "stats", "diff",
     * "read", "files", "restore", "open", "close", "adopt") and `args` (strings). Reads the logbook's local repository;
     * "restore" adds a commit, "open" loads a version read only, "close" reads the logbook again, "adopt" brings in the
     * history of this device's own logbook (the folder is always this plugin's, whatever the page passes).
     */
    @PluginMethod
    fun history(call: PluginCall) = onCoreThread(call) {
        val action = call.getString("action", "") ?: ""
        val args = if (action == "adopt") arrayOf(repoDir.absolutePath) else call.getArray("args")?.toList<String>()?.toTypedArray() ?: emptyArray()
        call.resolve(JSObject().put("json", NativeCore.history(action, args)))
    }

    /** Local commits of the loaded cloud log not yet on the server (manual synchronisation). */
    @PluginMethod
    fun pendingChanges(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        call.resolve(JSObject().put("json", NativeCore.pendingChanges()))
    }

    /**
     * Signs out: the core closes the log and forgets the account (and deletes
     * the device copy when asked, never with changes not sent), then the
     * stored credentials are forgotten (Android Keystore, and the
     * development file).
     */
    @PluginMethod
    fun signOut(call: PluginCall) = onCoreThread(call) {
        NativeCore.cloudSignOut(call.getBoolean("deleteCopy", false) == true)
        credentialStore.delete()
        gitStore.delete() // "Se déconnecter du dépôt": the token is erased from this device
        pendingAccount = null
        File(context.filesDir, DEV_CREDENTIALS).delete()
        Log.i(TAG, "signOut: credentials forgotten")
        call.resolve()
    }

    /**
     * Deletes the cloud account (see benthic.h). With keepDives, the dives
     * are first saved as a new log without account; once the server confirms,
     * it becomes the device's log and the previous one is kept aside, renamed.
     * The password is never logged.
     */
    @PluginMethod
    fun deleteAccount(call: PluginCall) = onCoreThread(call) {
        val password = call.getString("password").orEmpty()
        val keepDives = call.getBoolean("keepDives", true) == true
        val kept = File(context.filesDir, "carnet.new")
        if (kept.exists()) kept.deleteRecursively() // left by an earlier attempt
        val json = NativeCore.cloudDeleteAccount(password, if (keepDives) "${kept.absolutePath}[main]" else "")
        val deleted = JSObject(json).optBoolean("deleted")
        if (deleted) {
            credentialStore.delete()
            File(context.filesDir, DEV_CREDENTIALS).delete()
            if (keepDives) {
                if (repoDir.exists()) repoDir.renameTo(File(context.filesDir, "carnet.before-${System.currentTimeMillis()}"))
                kept.renameTo(repoDir)
            }
        } else if (kept.exists()) {
            kept.deleteRecursively()
        }
        Log.i(TAG, "deleteAccount: deleted=$deleted")
        call.resolve(JSObject().put("json", json))
    }

    /**
     * Signs in with typed credentials: the account is set, then the server
     * is asked for its log branch (cloud_probe), which checks the password.
     * Rejects with INCORRECT (credentials refused) or NETWORK; the previous
     * account is then set again. With a logbook on the server, the
     * credentials are stored (Android Keystore); without one (an account that
     * has no logbook yet), they wait in memory for createLog. Never logged.
     */
    @PluginMethod
    fun signIn(call: PluginCall) = onCoreThread(call) {
        // "email address MUST be lower case" (Subsurface-mobile).
        val email = call.getString("email").orEmpty().trim().lowercase()
        val password = call.getString("password").orEmpty()
        NativeCore.setCloudTestEmail(readTestEmail())
        NativeCore.cloudConfigure(email, password)
        val json = try {
            NativeCore.cloudProbe()
        } catch (e: IllegalStateException) {
            configureStoredAccount()
            val code = if (e.message?.contains("Credentials rejected") == true) "INCORRECT" else "NETWORK"
            Log.i(TAG, "signIn: $code")
            call.reject(code, code)
            return@onCoreThread
        }
        val exists = JSObject(json).optBoolean("exists")
        if (exists) {
            credentialStore.write(email, password)
            pendingAccount = null
        } else {
            pendingAccount = email to password
        }
        Log.i(TAG, "signIn: verified, logbook on the server: $exists")
        call.resolve(JSObject().put("exists", exists).put("email", email))
    }

    /**
     * New account, step 1 (cloud_create_account; a cloud write, under the
     * write lock). "need_pin": the server mailed a code, the credentials
     * wait in memory for verifyPin. "verified": the account already exists
     * with this password (sign in instead). "incorrect": refused.
     */
    @PluginMethod
    fun createAccount(call: PluginCall) = onCoreThread(call) {
        val email = call.getString("email").orEmpty().trim().lowercase()
        val password = call.getString("password").orEmpty()
        NativeCore.setCloudTestEmail(readTestEmail())
        val result = JSObject(NativeCore.cloudCreateAccount(email, password))
        val status = result.optString("status")
        if (status == "need_pin") pendingAccount = email to password
        // The server's reply never holds the password.
        Log.i(TAG, "createAccount: $status (HTTP ${result.optInt("http")}, ${result.optString("reply")})")
        call.resolve(JSObject().put("status", status).put("email", email))
    }

    // --- Own git repository instead of the cloud (spec, "Own git repository instead of the cloud") ---

    /**
     * Asks a repository server for its references (git_check): anonymous, or,
     * with a token, as for a push (checks the token and its right to write).
     * The token is the typed one, or, with `useStored`, the stored one (the
     * form that edits the repository, token left empty). Network only: runs
     * beside a load. Resolves `json` ({status, empty, branches}); rejects
     * with BAD_ADDRESS or BAD_CREDENTIALS. Nothing is stored or logged.
     */
    @PluginMethod
    fun gitCheck(call: PluginCall) {
        val url = call.getString("url").orEmpty()
        var username = call.getString("username").orEmpty().trim()
        var token = call.getString("token").orEmpty().trim()
        networkThread.execute {
            try {
                setupDone.await()
                if (call.getBoolean("useStored", false) == true && token.isEmpty()) {
                    val stored = gitStore.read()
                    if (stored != null) {
                        username = stored.username
                        token = stored.token
                    }
                }
                call.resolve(JSObject().put("json", NativeCore.gitCheck(url, username, token)))
            } catch (e: IllegalStateException) {
                // BAD_ADDRESS or BAD_CREDENTIALS, from the core.
                call.reject(e.message, e.message.orEmpty().substringBefore(':'))
            } catch (e: Exception) {
                Log.e(TAG, "Git check error", e)
                call.reject("CORE_ERROR", "CORE_ERROR")
            }
        }
    }

    // --- Git on the device (bgit.h): the working copies of the Benthic server's logbooks ---

    /** Git work runs on its own thread: it never waits for the core, and a long clone does not hold the others. */
    private val gitThread: ExecutorService = Executors.newSingleThreadExecutor()

    /** The working copies: `<files>/bgit/<dir>`, the folder @capacitor/filesystem calls `Directory.Data` + `bgit/<dir>`. */
    private val bgitRoot: File by lazy {
        val root = File(context.filesDir, "bgit")
        // The folder was `odgit` before the rename to Benthic (22 November 2026): renamed once, on first use.
        val legacy = File(context.filesDir, "odgit")
        if (legacy.exists() && !root.exists()) legacy.renameTo(root)
        root
    }

    /**
     * Runs one git call (options: `dir`, the working copy's name under bgit/) off the main thread and resolves
     * `json`; rejects with the error code (UNREACHABLE, REFUSED, REJECTED, CANCELLED, ...). The development server is
     * plain http: allowed in debuggable builds only. Progress goes out as "gitProgress" events ({dir, phase, done, total}).
     */
    private fun bgit(call: PluginCall, work: (String, DownloadListener) -> String) {
        val name = call.getString("dir").orEmpty()
        if (name.isEmpty() || name.startsWith("/") || name.contains("..") || name.contains("\\")) {
            call.reject("BAD_PATH", "BAD_PATH")
            return
        }
        gitThread.execute {
            try {
                setupDone.await()
                val debuggable = (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                NativeCore.bgitAllowHttp(debuggable)
                val listener = DownloadListener { json ->
                    try {
                        notifyListeners("gitProgress", JSObject(json).put("dir", name))
                    } catch (e: Exception) {
                        // A progress report is never worth a failure.
                    }
                }
                call.resolve(JSObject().put("json", work(File(bgitRoot, name).absolutePath, listener)))
            } catch (e: IllegalStateException) {
                call.reject(e.message, e.message.orEmpty().substringBefore(':'))
            } catch (e: Exception) {
                Log.e(TAG, "Git error", e)
                call.reject("CORE_ERROR", "CORE_ERROR")
            }
        }
    }

    private fun PluginCall.paths(): Array<String> = getArray("paths")?.toList<String>()?.toTypedArray() ?: emptyArray()

    /** Makes the working copy from a branch of the repository (options: url, dir, branch, username, token). */
    @PluginMethod
    fun bgitClone(call: PluginCall) {
        val url = call.getString("url").orEmpty()
        val branch = call.getString("branch").orEmpty()
        val user = call.getString("username").orEmpty()
        val token = call.getString("token").orEmpty()
        bgit(call) { dir, listener -> NativeCore.bgitClone(url, dir, branch, user, token, listener) }
    }

    /** Fetches the branch and merges it (options: dir, branch, username, token). */
    @PluginMethod
    fun bgitPull(call: PluginCall) {
        val branch = call.getString("branch").orEmpty()
        val user = call.getString("username").orEmpty()
        val token = call.getString("token").orEmpty()
        bgit(call) { dir, listener -> NativeCore.bgitPull(dir, branch, user, token, call.getString("authorName"), call.getString("authorEmail"), listener) }
    }

    /** Stages the files and commits (options: dir, paths, message, mergeParent). */
    @PluginMethod
    fun bgitCommit(call: PluginCall) {
        val paths = call.paths()
        val message = call.getString("message").orEmpty()
        bgit(call) { dir, _ ->
            NativeCore.bgitCommit(dir, paths, message, call.getString("authorName"), call.getString("authorEmail"), call.getString("mergeParent"))
        }
    }

    /** Sends the branch (options: dir, branch, username, token). */
    @PluginMethod
    fun bgitPush(call: PluginCall) {
        val branch = call.getString("branch").orEmpty()
        val user = call.getString("username").orEmpty()
        val token = call.getString("token").orEmpty()
        bgit(call) { dir, listener -> NativeCore.bgitPush(dir, branch, user, token, listener) }
    }

    @PluginMethod
    fun bgitStatus(call: PluginCall) {
        val paths = call.paths()
        bgit(call) { dir, _ -> NativeCore.bgitStatus(dir, paths) }
    }

    @PluginMethod
    fun bgitUnpushed(call: PluginCall) {
        val branch = call.getString("branch").orEmpty()
        bgit(call) { dir, _ -> NativeCore.bgitUnpushed(dir, branch) }
    }

    @PluginMethod
    fun bgitHead(call: PluginCall) {
        val branch = call.getString("branch").orEmpty()
        bgit(call) { dir, _ -> NativeCore.bgitHead(dir, branch) }
    }

    @PluginMethod
    fun bgitListFiles(call: PluginCall) {
        val prefix = call.getString("prefix").orEmpty()
        bgit(call) { dir, _ -> NativeCore.bgitListFiles(dir, prefix) }
    }

    /** Writes or deletes files in the working copy (options: dir, files: [{path, text|null}], null text = delete). */
    @PluginMethod
    fun bgitWrite(call: PluginCall) {
        val list = call.getArray("files")
        val paths = ArrayList<String>()
        val texts = ArrayList<String?>()
        if (list != null) {
            for (i in 0 until list.length()) {
                val item = list.optJSONObject(i)
                paths.add(item?.optString("path").orEmpty())
                texts.add(if (item == null || item.isNull("text")) null else item.getString("text"))
            }
        }
        bgit(call) { dir, _ -> NativeCore.bgitWrite(dir, paths.toTypedArray(), texts.toTypedArray()) }
    }

    /** The text of each path at HEAD (options: dir, paths). */
    @PluginMethod
    fun bgitRead(call: PluginCall) {
        val paths = call.paths()
        bgit(call) { dir, _ -> NativeCore.bgitRead(dir, paths) }
    }

    /** What changed between two commits (options: dir, fromCommit, toCommit; empty fromCommit = everything). */
    @PluginMethod
    fun bgitDiff(call: PluginCall) {
        val from = call.getString("fromCommit").orEmpty()
        val to = call.getString("toCommit").orEmpty()
        bgit(call) { dir, _ -> NativeCore.bgitDiff(dir, from, to) }
    }

    /** The paths of every file at HEAD (options: dir). */
    @PluginMethod
    fun bgitFiles(call: PluginCall) {
        bgit(call) { dir, _ -> NativeCore.bgitFiles(dir) }
    }

    /** Removes the working copy's folder. */
    @PluginMethod
    fun bgitRemove(call: PluginCall) {
        bgit(call) { dir, _ ->
            NativeCore.bgitRemove(dir)
            "{}"
        }
    }

    /** Stops the running git call (it fails with CANCELLED). Runs at once, on the calling thread. */
    @PluginMethod
    fun bgitCancel(call: PluginCall) {
        NativeCore.bgitCancel()
        call.resolve()
    }

    /** Keeps the Benthic server's session (the e-mail sign-in's answer) in the Keystore; nothing is returned. */
    @PluginMethod
    fun serverSessionSave(call: PluginCall) {
        try {
            serverStore.write(
                ServerSession(
                    email = call.getString("email").orEmpty(),
                    sessionToken = call.getString("sessionToken").orEmpty(),
                    repositoryUrl = call.getString("repositoryUrl").orEmpty(),
                    branch = call.getString("branch").orEmpty(),
                    gitUsername = call.getString("gitUsername").orEmpty(),
                    gitToken = call.getString("gitToken").orEmpty(),
                ),
            )
            call.resolve()
        } catch (e: IllegalArgumentException) {
            call.reject("BAD_ARGUMENT", "BAD_ARGUMENT")
        } catch (e: Exception) {
            Log.e(TAG, "serverSessionSave failed", e)
            call.reject("CREDENTIALS_NOT_SAVED", "CREDENTIALS_NOT_SAVED")
        }
    }

    /** Who is signed in to the Benthic server, without any token. */
    @PluginMethod
    fun serverSessionInfo(call: PluginCall) {
        val stored = serverStore.read()
        call.resolve(
            JSObject()
                .put("signedIn", stored != null)
                .put("email", stored?.email.orEmpty())
                .put("repositoryUrl", stored?.repositoryUrl.orEmpty())
                .put("branch", stored?.branch.orEmpty()),
        )
    }

    /** The access to the repository (the git user name and token), for the download only. */
    @PluginMethod
    fun serverSessionAccess(call: PluginCall) {
        val stored = serverStore.read()
        if (stored == null) {
            call.reject("NOT_SIGNED_IN", "NOT_SIGNED_IN")
            return
        }
        call.resolve(
            JSObject()
                .put("repositoryUrl", stored.repositoryUrl)
                .put("branch", stored.branch)
                .put("username", stored.gitUsername)
                .put("token", stored.gitToken)
                .put("sessionToken", stored.sessionToken),
        )
    }

    /** The device's data key for the sensitive items (section 11.5 of the architecture): base64, or "" when there is none. */
    @PluginMethod
    fun dataKeyRead(call: PluginCall) {
        call.resolve(JSObject().put("key", dataKeyFile.read().orEmpty()))
    }

    @PluginMethod
    fun dataKeyWrite(call: PluginCall) {
        val key = call.getString("key").orEmpty()
        if (!Regex("[A-Za-z0-9+/=]{16,128}").matches(key)) {
            call.reject("BAD_ARGUMENT", "BAD_ARGUMENT")
            return
        }
        try {
            dataKeyFile.write(key)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "dataKeyWrite failed", e)
            call.reject("CREDENTIALS_NOT_SAVED", "CREDENTIALS_NOT_SAVED")
        }
    }

    /**
     * DEVELOPMENT ONLY (debuggable builds; refused otherwise): « Rejouer le premier lancement » as a full reset. The core closes
     * its log; the device logbook, the working copies of the server, every stored credential and the data key, the staged
     * imports and exports go. Kept: the alpha's cache (`.subsurface`, unless `keepAlpha` is false), the development
     * authority (`cacerts.pem`) and the stylesheets. No server is called.
     */
    @PluginMethod
    fun devResetApp(call: PluginCall) = onCoreThread(call) {
        val debuggable = (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (!debuggable) {
            call.reject("NOT_DEBUG", "NOT_DEBUG")
            return@onCoreThread
        }
        val keepAlpha = call.getBoolean("keepAlpha", true) != false
        NativeCore.cloudSignOut(false)
        credentialStore.delete()
        gitStore.delete()
        serverStore.delete()
        dataKeyFile.delete()
        pendingAccount = null
        val files = context.filesDir
        files.listFiles()?.forEach { f ->
            val name = f.name
            val device = name == "carnet" || name.startsWith("carnet.") || name == "bgit" || name == DEV_CREDENTIALS
            val alpha = name == ".subsurface" && !keepAlpha
            if (device || alpha) f.deleteRecursively()
        }
        context.cacheDir.listFiles()?.forEach { f ->
            if (f.name.startsWith(IMPORT_PREFIX) || f.name == "import" || f.name == "exports") f.deleteRecursively()
        }
        Log.i(TAG, "devResetApp: device data erased (alpha kept: $keepAlpha)")
        call.resolve()
    }

    /** Signs out of the Benthic server: the tokens are erased from this device. */
    @PluginMethod
    fun serverSessionClear(call: PluginCall) {
        serverStore.delete()
        call.resolve()
    }

    /** The stored repository without its token ({url, username, branch}), or empty: for the form that edits it. */
    @PluginMethod
    fun gitConfig(call: PluginCall) {
        val stored = gitStore.read()
        call.resolve(
            JSObject()
                .put("url", stored?.url?.substringBeforeLast('[').orEmpty())
                .put("username", stored?.username.orEmpty())
                .put("branch", stored?.branch.orEmpty()),
        )
    }

    /**
     * Uses the repository for the logbook: sets it in the core, asks the
     * server for the log branch, and, for a repository that holds no
     * reference at all (`empty`), creates the branch (the first push). The
     * address, user name, branch and token are then stored (Keystore). On any
     * failure the previous repository (or account) is set again and nothing is
     * stored. Rejects with BAD_ADDRESS, BAD_CREDENTIALS, BAD_BRANCH, DENIED,
     * NETWORK, NO_LOG (the branch is not in the repository), CREATE_FAILED.
     * The token is never logged.
     */
    @PluginMethod
    fun gitConnect(call: PluginCall) = onCoreThread(call) {
        val url = call.getString("url").orEmpty()
        val username = call.getString("username").orEmpty().trim()
        val branch = call.getString("branch").orEmpty().trim()
        val previous = gitStore.read()
        // The form that edits the repository leaves the token empty to keep it.
        val token = call.getString("token").orEmpty().trim().ifEmpty { previous?.token.orEmpty() }
        try {
            NativeCore.gitConfigure(url, username, token, branch)
            var created = false
            val exists = JSObject(NativeCore.cloudProbe()).optBoolean("exists")
            if (!exists) {
                if (call.getBoolean("empty", false) != true) throw IllegalStateException("NO_LOG")
                NativeCore.gitCreateLog()
                created = true
            }
            val address = url.trim().trimEnd('/')
            gitStore.write(GitRemote("$address[$branch]", username, branch, token))
            Log.i(TAG, "gitConnect: repository set, branch created: $created")
            call.resolve(JSObject().put("created", created))
        } catch (e: IllegalStateException) {
            restoreAfterFailedGitConnect(previous)
            val code = when {
                e.message?.contains("Credentials rejected") == true -> "DENIED"
                else -> e.message.orEmpty().substringBefore(':').ifEmpty { "CORE_ERROR" }
            }
            val known = setOf("BAD_ADDRESS", "BAD_CREDENTIALS", "BAD_BRANCH", "DENIED", "NO_LOG", "CREATE_FAILED", "LOG_EXISTS", "NOT_EMPTY")
            val final = if (code in known) code else "NETWORK"
            Log.i(TAG, "gitConnect: $final")
            call.reject(final, final)
        }
    }

    /** After a refused connection: the repository (or cloud account) the device had is set again. */
    private fun restoreAfterFailedGitConnect(previous: GitRemote?) {
        try {
            if (previous != null) {
                NativeCore.gitConfigure(previous.url.substringBeforeLast('['), previous.username, previous.token, previous.branch)
            } else {
                configureStoredAccount()
            }
        } catch (e: IllegalStateException) {
            // Nothing to set again.
        }
    }

    /** "Renvoyer le code": the same request as createAccount, for the account waiting for its code. */
    @PluginMethod
    fun resendCode(call: PluginCall) = onCoreThread(call) {
        val account = pendingAccount
        if (account == null) {
            call.reject("NO_ACCOUNT", "NO_ACCOUNT")
            return@onCoreThread
        }
        NativeCore.setCloudTestEmail(readTestEmail())
        val result = JSObject(NativeCore.cloudCreateAccount(account.first, account.second))
        val status = result.optString("status")
        Log.i(TAG, "resendCode: $status (HTTP ${result.optInt("http")}, ${result.optString("reply")})")
        call.resolve(JSObject().put("status", status))
    }

    /** New account, the confirmation code (cloud_verify_pin). "verified": the account is set (in memory). */
    @PluginMethod
    fun verifyPin(call: PluginCall) = onCoreThread(call) {
        val account = pendingAccount
        if (account == null) {
            call.reject("NO_ACCOUNT", "NO_ACCOUNT")
            return@onCoreThread
        }
        NativeCore.setCloudTestEmail(readTestEmail())
        val pin = call.getString("pin").orEmpty().trim()
        val result = JSObject(NativeCore.cloudVerifyPin(account.first, account.second, pin))
        val status = result.optString("status")
        if (status == "verified") NativeCore.cloudConfigure(account.first, account.second)
        Log.i(TAG, "verifyPin: $status (HTTP ${result.optInt("http")}, ${result.optString("reply")})")
        call.resolve(JSObject().put("status", status))
    }

    /** Downloads of divelogs.de waiting for the account's first logbook (app cache, deleted after use). */
    private fun importFile(path: String): File? {
        val file = File(path)
        return if (file.parentFile?.canonicalPath == context.cacheDir.canonicalPath && file.name.startsWith(IMPORT_PREFIX)) file else null
    }

    /**
     * Import, step 1: downloads the divelogs.de logbook once into the app's
     * cache. `user` and `password` are only passed to the core, never kept or
     * logged. Writes {dives, path}; with no dive, no file (path empty).
     */
    @PluginMethod
    fun divelogsDownload(call: PluginCall) = onCoreThread(call) {
        val target = File(context.cacheDir, "$IMPORT_PREFIX${System.currentTimeMillis()}.dld")
        try {
            val result = JSObject(
                NativeCore.divelogsDownload(call.getString("user").orEmpty(), call.getString("password").orEmpty(), target.absolutePath),
            )
            val dives = result.optInt("dives")
            Log.i(TAG, "divelogsDownload: $dives dives")
            call.resolve(JSObject().put("dives", dives).put("path", if (dives > 0) target.absolutePath else ""))
        } catch (e: Exception) {
            target.delete()
            throw e
        }
    }

    /**
     * Step 2's "Continuer" with divelogs.de: checks the credentials before
     * the import starts (divelogs_check), {dives}. Rejects with LOGIN_FAILED,
     * NETWORK… The credentials are only passed to the core.
     */
    @PluginMethod
    fun divelogsCheck(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject(NativeCore.divelogsCheck(call.getString("user").orEmpty(), call.getString("password").orEmpty())))
    }

    /**
     * Step 2's "Depuis un fichier": the file picked in the web layer is written to the app's cache for the
     * import steps (importCount, createLog, importDives); {path}. A big file comes in pieces, never as one
     * string (the bridge and the Java heap cannot hold a logbook): the first call (`name`, base64 `data` of the
     * first piece) creates the file, the next ones give `path` and `append: true` to add their piece.
     */
    @PluginMethod
    fun stageImport(call: PluginCall) = onCoreThread(call) {
        val data = call.getString("data")
        if (data == null) {
            call.reject("BAD_REQUEST", "BAD_REQUEST")
            return@onCoreThread
        }
        if (call.getBoolean("append", false) == true) {
            val file = importFile(call.getString("path").orEmpty())
            if (file == null || !file.exists()) {
                call.reject("BAD_REQUEST", "BAD_REQUEST")
                return@onCoreThread
            }
            java.io.FileOutputStream(file, true).use { it.write(Base64.decode(data, Base64.DEFAULT)) }
            call.resolve(JSObject().put("path", file.absolutePath))
            return@onCoreThread
        }
        val file = newStagedFile(call.getString("name").orEmpty())
        file.writeBytes(Base64.decode(data, Base64.DEFAULT))
        call.resolve(JSObject().put("path", file.absolutePath))
    }

    /** A new file in the cache that the import calls accept (importFile): a unique name that keeps the extension. */
    private fun newStagedFile(name: String): File {
        val clean = File(name).name.replace(Regex("[^A-Za-z0-9._-]"), "_").ifEmpty { "import.xml" }
        return File(context.cacheDir, "$IMPORT_PREFIX${System.nanoTime()}-$clean")
    }

    /**
     * A piece of a staged file, base64 (at most 4 MB): {data, size}. The web layer reads a big logbook this way
     * to look at its beginning or to scan it; the whole file never crosses the bridge.
     */
    @PluginMethod
    fun readFileChunk(call: PluginCall) = onCoreThread(call) {
        val file = importFile(call.getString("path").orEmpty())
        if (file == null || !file.exists()) {
            call.reject("BAD_REQUEST", "BAD_REQUEST")
            return@onCoreThread
        }
        val offset = call.data.optLong("offset", 0L).coerceAtLeast(0L)
        val length = (call.getInt("length") ?: 65536).coerceIn(0, MAX_CHUNK)
        val buffer = ByteArray(length)
        var read = 0
        java.io.RandomAccessFile(file, "r").use { raf ->
            raf.seek(offset)
            while (read < length) {
                val n = raf.read(buffer, read, length - read)
                if (n < 0) break
                read += n
            }
        }
        call.resolve(JSObject().put("data", Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP)).put("size", file.length()))
    }

    /**
     * A new staged file made of pieces: `parts` is a list of {path, start, end} (a byte range of a staged file)
     * and {text} (literal text, UTF-8), copied in order with a small buffer. Used to put the sites a dives file
     * lacks into it without reading the whole file into memory. {path}.
     */
    @PluginMethod
    fun assembleFile(call: PluginCall) = onCoreThread(call) {
        val parts = call.getArray("parts")
        if (parts == null || parts.length() == 0) {
            call.reject("BAD_REQUEST", "BAD_REQUEST")
            return@onCoreThread
        }
        val target = newStagedFile(call.getString("name").orEmpty())
        try {
            java.io.FileOutputStream(target).use { out ->
                val buffer = ByteArray(64 * 1024)
                for (i in 0 until parts.length()) {
                    val part = parts.getJSONObject(i)
                    if (part.has("text")) {
                        out.write(part.getString("text").toByteArray(Charsets.UTF_8))
                        continue
                    }
                    val source = importFile(part.optString("path"))
                    if (source == null || !source.exists()) throw IllegalArgumentException("BAD_REQUEST")
                    val start = part.optLong("start", 0L)
                    var left = part.optLong("end", source.length()) - start
                    java.io.RandomAccessFile(source, "r").use { raf ->
                        raf.seek(start)
                        while (left > 0) {
                            val n = raf.read(buffer, 0, minOf(buffer.size.toLong(), left).toInt())
                            if (n < 0) break
                            out.write(buffer, 0, n)
                            left -= n
                        }
                    }
                }
            }
            call.resolve(JSObject().put("path", target.absolutePath))
        } catch (e: Exception) {
            target.delete()
            call.reject("BAD_REQUEST", "BAD_REQUEST")
        }
    }

    /** Import, step 2: reads the downloaded file (read-only), {dives}. */
    @PluginMethod
    fun importCount(call: PluginCall) = onCoreThread(call) {
        val file = importFile(call.getString("path").orEmpty())
        if (file == null) {
            call.reject("BAD_REQUEST", "BAD_REQUEST")
            return@onCoreThread
        }
        call.resolve(JSObject(NativeCore.importCount(file.absolutePath)))
    }

    /**
     * A CSV file with the column mapping chosen in the web layer (import_csv in benthic.h). `path` and
     * `companionPath` (Poseidon MkVI: the .txt of the dive) are files staged with stageImport; `params` is
     * the mapping as JSON text. With `dryRun` nothing is added and the answer is the preview
     * ({dives:[{when, durationSeconds, maxDepthMm, profile}]}); otherwise the dives are imported, one
     * undoable step. Rejects with IMPORT_FAILED, NO_DIVES, BAD_REQUEST.
     */
    @PluginMethod
    fun importCsv(call: PluginCall) = onCoreThread(call) {
        val file = importFile(call.getString("path").orEmpty())
        val companionPath = call.getString("companionPath").orEmpty()
        val companion = if (companionPath.isEmpty()) null else importFile(companionPath)
        if (file == null || (companionPath.isNotEmpty() && companion == null)) {
            call.reject("BAD_REQUEST", "BAD_REQUEST")
            return@onCoreThread
        }
        val name = File(call.getString("name").orEmpty()).name.ifEmpty { "import.csv" }
        call.resolve(
            JSObject().put(
                "json",
                NativeCore.importCsv(
                    file.absolutePath,
                    companion?.absolutePath.orEmpty(),
                    call.getString("params").orEmpty(),
                    name,
                    call.getBoolean("dryRun", true) == true,
                ),
            ),
        )
    }

    /** iCloud Drive exists on iOS only (task 2026-11-16-261): Android never offers it and rejects if it is asked. */
    @PluginMethod
    fun createIcloudLogbook(call: PluginCall) {
        call.reject("NOT_AVAILABLE", "NOT_AVAILABLE")
    }

    /** Cancelled or failed import: the downloaded file is deleted. */
    @PluginMethod
    fun discardImport(call: PluginCall) = onCoreThread(call) {
        importFile(call.getString("path").orEmpty())?.delete()
        call.resolve()
    }

    /**
     * First logbook of the account just created or signed in to
     * (cloud_create_log, the only step that writes to the account): "empty";
     * "import", the file downloaded by divelogsDownload (`path`, deleted
     * afterwards); or "device", the logbook of this device. The account's
     * credentials are then stored.
     */
    @PluginMethod
    fun createLog(call: PluginCall) = onCoreThread(call) {
        val account = pendingAccount
        if (account == null) {
            call.reject("NO_ACCOUNT", "NO_ACCOUNT")
            return@onCoreThread
        }
        NativeCore.setCloudTestEmail(readTestEmail())
        NativeCore.cloudConfigure(account.first, account.second)
        val source = call.getString("source").orEmpty()
        var download: File? = null
        val importPath = when (source) {
            "import" -> {
                download = importFile(call.getString("path").orEmpty())
                if (download == null) {
                    call.reject("BAD_REQUEST", "BAD_REQUEST")
                    return@onCoreThread
                }
                download.absolutePath
            }
            "device" -> if (NativeCore.logExists(repo)) repo else ""
            "empty" -> ""
            else -> {
                call.reject("BAD_REQUEST", "BAD_REQUEST")
                return@onCoreThread
            }
        }
        try {
            val json = NativeCore.cloudCreateLog(importPath)
            credentialStore.write(account.first, account.second)
            pendingAccount = null
            Log.i(TAG, "createLog($source): created")
            call.resolve(JSObject().put("json", json))
        } finally {
            download?.delete()
        }
    }

    /** Edits one dive as one undoable step; `changes` is the JSON object of edit_dive(). */
    @PluginMethod
    fun editDive(call: PluginCall) = onCoreThread(call) {
        val id = call.getInt("id")
        val changes = call.getObject("changes")
        if (id == null || changes == null) {
            call.reject("Missing id or changes", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.editDive(id, changes.toString())))
    }

    /** A trip of the loaded log; its id comes from listDives and is valid until the next load. */
    @PluginMethod
    fun getTrip(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.getTrip(call.getInt("tripId") ?: 0)))
    }

    /** One undoable trip change (see benthic.h): location, notes, remove, split, merge, add, ungroup, create. */
    @PluginMethod
    fun tripAction(call: PluginCall) = onCoreThread(call) {
        val ids = call.getArray("diveIds")?.toList<Int>()?.toIntArray()
        val json = NativeCore.tripAction(
            call.getString("action").orEmpty(),
            call.getInt("tripId") ?: 0,
            call.getInt("diveId") ?: 0,
            call.getInt("otherId") ?: 0,
            ids,
            call.getString("value").orEmpty(),
        )
        call.resolve(JSObject().put("json", json))
    }

    @PluginMethod
    fun undo(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.undo(call.getBoolean("redo", false) == true)))
    }

    /** Local save, then for a cloud log the sync of Subsurface-mobile (fetch, merge, push). */
    @PluginMethod
    fun syncChanges(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.sync()
        Log.i(TAG, "syncChanges: $json")
        call.resolve(JSObject().put("json", json))
    }

    /** The dives of the log in memory, without loading anything (after a sync that reloaded it). */
    @PluginMethod
    fun listLoadedDives(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.listLoadedDives(call.getBoolean("includeInvalid", false) == true)))
    }

    /** Local save only, without network (manual synchronisation). */
    @PluginMethod
    fun saveLocal(call: PluginCall) = onCoreThread(call) {
        NativeCore.saveLocal()
        call.resolve()
    }

    /**
     * A site uuid (an unsigned 32-bit number). Capacitor's getLong returns null
     * for a number small enough to be parsed as an Integer, so read any Number.
     */
    private fun PluginCall.uuid(name: String): Long = (data.opt(name) as? Number)?.toLong() ?: 0L

    /** Read-only tools (see benthic.h): cylinders (types), weights (types), desaturation. */
    @PluginMethod
    fun toolQuery(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.toolQuery(call.getString("kind").orEmpty())
        call.resolve(JSObject().put("json", json))
    }

    /** Read-only site queries (see benthic.h): list, site, nearby, duplicates, without. */
    @PluginMethod
    fun siteQuery(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.siteQuery(
            call.getString("kind").orEmpty(),
            call.uuid("uuid"),
            call.getInt("lat") ?: 0,
            call.getInt("lon") ?: 0,
            call.getInt("a") ?: 0,
            call.getInt("b") ?: 0,
            call.getString("text").orEmpty(),
        )
        call.resolve(JSObject().put("json", json))
    }

    /**
     * Read-only free filter (see benthic.h): kind "options", or "dives" with
     * fulltext, mode and rules [{type, stringMode, rangeMode, negate, data}].
     */
    @PluginMethod
    fun filterQuery(call: PluginCall) = onCoreThread(call) {
        val rules = mutableListOf<String>()
        val list = call.getArray("rules")
        if (list != null) {
            for (i in 0 until list.length()) {
                val rule = list.getJSONObject(i)
                rules.add(rule.optString("type"))
                rules.add(rule.optString("stringMode"))
                rules.add(rule.optString("rangeMode"))
                rules.add(if (rule.optBoolean("negate")) "1" else "0")
                rules.add(rule.optString("data"))
            }
        }
        val json = NativeCore.filterQuery(
            call.getString("kind").orEmpty(),
            call.getString("fulltext").orEmpty(),
            call.getString("mode").orEmpty(),
            rules.toTypedArray(),
        )
        call.resolve(JSObject().put("json", json))
    }

    /** The five strings per rule that the native side takes (see filterQuery). */
    private fun PluginCall.flatRules(): Array<String> {
        val rules = mutableListOf<String>()
        val list = getArray("rules") ?: return rules.toTypedArray()
        for (i in 0 until list.length()) {
            val rule = list.getJSONObject(i)
            rules.add(rule.optString("type"))
            rules.add(rule.optString("stringMode"))
            rules.add(rule.optString("rangeMode"))
            rules.add(if (rule.optBoolean("negate")) "1" else "0")
            rules.add(rule.optString("data"))
        }
        return rules.toTypedArray()
    }

    /** Logs a dive by hand (create_dive): one undoable step. */
    @PluginMethod
    fun createDive(call: PluginCall) = onCoreThread(call) {
        val fields = call.getObject("fields")
        if (fields == null) {
            call.reject("Missing fields", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.createDive(fields.toString())))
    }

    /** Whether the device is on Wi-Fi or Ethernet (the WebView does not say). */
    /** A Nominatim request, sent with the app's identification (its usage policy; a WebView cannot set it). */
    @PluginMethod
    fun placesSearch(call: PluginCall) {
        val url = call.getString("url")
        if (url == null || !url.startsWith("https://nominatim.openstreetmap.org/")) {
            call.reject("Bad address", "BAD_ARGUMENT")
            return
        }
        networkThread.execute {
            try {
                val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                try {
                    connection.connectTimeout = 15_000
                    connection.readTimeout = 15_000
                    connection.setRequestProperty("User-Agent", userAgent)
                    connection.setRequestProperty("Accept", "application/json")
                    val status = connection.responseCode
                    val body = if (status in 200..299) connection.inputStream.bufferedReader().use { it.readText() } else ""
                    call.resolve(JSObject().put("status", status).put("body", body))
                } finally {
                    connection.disconnect()
                }
            } catch (e: Exception) {
                call.reject(e.message ?: "Cannot reach the server", "NETWORK")
            }
        }
    }

    /** Error reports (task #102): the crash saved before the app died, as JSON text (empty when none). Nothing is sent from here. */
    @PluginMethod
    fun pendingCrashReport(call: PluginCall) {
        call.resolve(JSObject().put("json", CrashReporter.pending(context)))
    }

    @PluginMethod
    fun clearCrashReport(call: PluginCall) {
        CrashReporter.clear(context)
        call.resolve()
    }

    @PluginMethod
    fun networkStatus(call: PluginCall) {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork)
        val wifi = capabilities != null &&
            (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
        call.resolve(JSObject().put("wifi", wifi))
    }

    /**
     * The system contrast level (Settings › Accessibility › Contrast), Android 14 and
     * later: 0 by default, up to 1; the app turns to high contrast above 0.5
     * (task 2026-11-14-149). Older systems answer 0.
     */
    @PluginMethod
    fun contrastLevel(call: PluginCall) {
        val level = if (Build.VERSION.SDK_INT >= 34) {
            (context.getSystemService(Context.UI_MODE_SERVICE) as android.app.UiModeManager).contrast
        } else 0f
        call.resolve(JSObject().put("level", level.toDouble()))
    }

    /** `Benthic/<versionName> (dive log app; <repository>)`: no personal data. */
    private val userAgent: String
        get() {
            val version = try {
                context.packageManager.getPackageInfo(context.packageName, 0).versionName
            } catch (e: Exception) {
                null
            }
            return "Benthic/${version ?: "unknown"} (dive log app; https://github.com/remillc/benthic)"
        }

    /** Takes back the last conflict choice while it is not sent. */
    @PluginMethod
    fun cancelConflictResolution(call: PluginCall) = onCoreThread(call) {
        NativeCore.cancelConflictResolution()
        call.resolve()
    }

    /** The computers the logbook's dives come from (dive_computers). */
    @PluginMethod
    fun diveComputers(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.diveComputers()))
    }

    /** One undoable change on a computer of the logbook: rename, remove, merge. */
    @PluginMethod
    fun diveComputerAction(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.diveComputerAction(
            call.getString("action").orEmpty(),
            call.getString("model").orEmpty(),
            call.getString("serial").orEmpty(),
            call.getString("value").orEmpty(),
            call.getString("intoModel").orEmpty(),
            call.getString("intoSerial").orEmpty(),
        )
        call.resolve(JSObject().put("json", json))
    }

    /** The planned dives, listed by the planner only (list_plans). */
    @PluginMethod
    fun listPlans(call: PluginCall) = onCoreThread(call) {
        call.resolve(JSObject().put("json", NativeCore.listPlans()))
    }

    /** Saves a plan as a planned dive, or replaces one (save_plan): one undoable step. */
    @PluginMethod
    fun savePlan(call: PluginCall) = onCoreThread(call) {
        val request = call.getObject("request")
        if (request == null) {
            call.reject("Missing request", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.savePlan(request.toString(), call.getInt("replaceId") ?: 0, call.getString("title") ?: "")))
    }

    /** Deletes a dive (delete_dive): one undoable step. */
    @PluginMethod
    fun deleteDive(call: PluginCall) = onCoreThread(call) {
        // One dive ("id") or several ("ids"), one undoable step.
        val ids = call.getArray("ids")?.toList<Int>()?.toIntArray() ?: call.getInt("id")?.let { intArrayOf(it) }
        if (ids == null || ids.isEmpty()) {
            call.reject("Missing id", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.deleteDive(ids)))
    }

    /** Merges dives into one (merge_dives): one undoable step. */
    @PluginMethod
    fun mergeDives(call: PluginCall) = onCoreThread(call) {
        val ids = call.getArray("ids")?.toList<Int>()?.toIntArray()
        if (ids == null || ids.size < 2) {
            call.reject("Missing ids", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.mergeDives(ids)))
    }

    /** Applies the same changes to several dives (edit_dives): one undoable step. */
    @PluginMethod
    fun editDives(call: PluginCall) = onCoreThread(call) {
        val ids = call.getArray("ids")?.toList<Int>()?.toIntArray()
        val changes = call.getObject("changes")
        if (ids == null || ids.isEmpty() || changes == null) {
            call.reject("Missing ids or changes", "BAD_ARGUMENT")
            return@onCoreThread
        }
        call.resolve(JSObject().put("json", NativeCore.editDives(ids, changes.toString())))
    }

    /** Renumbers dives in date order (renumber_dives): all of them if no ids, one undoable step. */
    @PluginMethod
    fun renumberDives(call: PluginCall) = onCoreThread(call) {
        val start = call.getInt("start")
        if (start == null) {
            call.reject("Missing start", "BAD_ARGUMENT")
            return@onCoreThread
        }
        val ids = call.getArray("ids")?.toList<Int>()?.toIntArray() ?: IntArray(0)
        // Optional: one number per id (RenumberDives' own pairs) instead of consecutive numbers.
        val numbers = call.getArray("numbers")?.toList<Int>()?.toIntArray() ?: IntArray(0)
        call.resolve(JSObject().put("json", NativeCore.renumberDives(ids, start, numbers)))
    }

    /**
     * Imports a file (import_dives). Either `path`, a file staged in the cache (stageImport, stageSharedFile,
     * assembleFile, exportDives with `stage`): the core reads it where it is, and it is deleted afterwards; or,
     * for a small file, `data` in base64, written to a temporary file with the original `name` (the core reads
     * the format from it), imported, then the copy is deleted. A logbook is never sent as `data`.
     */
    @PluginMethod
    fun importDives(call: PluginCall) = onCoreThread(call) {
        val name = File(call.getString("name").orEmpty()).name.ifEmpty { "import.xml" }
        val staged = call.getString("path")
        if (staged != null) {
            val file = importFile(staged)
            if (file == null || !file.exists()) {
                call.reject("BAD_REQUEST", "BAD_REQUEST")
                return@onCoreThread
            }
            try {
                call.resolve(JSObject().put("json", NativeCore.importDives(file.absolutePath, name)))
            } finally {
                file.delete()
            }
            return@onCoreThread
        }
        val data = call.getString("data")
        if (data == null) {
            call.reject("Missing data", "BAD_ARGUMENT")
            return@onCoreThread
        }
        val dir = File(context.cacheDir, "import").apply { mkdirs() }
        val file = File(dir, name)
        try {
            file.writeBytes(Base64.decode(data, Base64.DEFAULT))
            call.resolve(JSObject().put("json", NativeCore.importDives(file.absolutePath, name)))
        } finally {
            file.delete()
        }
    }

    /**
     * Several files chosen together (import_dives_files): "files" is a list of
     * {name, data} (base64 contents, original name). They are written to one
     * temporary folder, so that a Suunto app .json and the .fit with the same
     * base name are read as one dive; the other files are read on their own.
     */
    @PluginMethod
    fun importDivesFiles(call: PluginCall) = onCoreThread(call) {
        val list = call.getArray("files")
        if (list == null || list.length() == 0) {
            call.reject("Missing files", "BAD_ARGUMENT")
            return@onCoreThread
        }
        val dir = File(context.cacheDir, "import/" + System.nanoTime()).apply { mkdirs() }
        try {
            val paths = mutableListOf<String>()
            for (i in 0 until list.length()) {
                val item = list.getJSONObject(i)
                val name = File(item.optString("name")).name.ifEmpty { "import-$i.xml" }
                val file = File(dir, name)
                file.writeBytes(Base64.decode(item.optString("data"), Base64.DEFAULT))
                paths.add(file.absolutePath)
            }
            val source = if (paths.size == 1) File(paths[0]).name else "multiple files"
            call.resolve(JSObject().put("json", NativeCore.importDivesFiles(paths.toTypedArray(), source)))
        } finally {
            dir.deleteRecursively()
        }
    }

    /**
     * The dives logged on this device without an account (its own log), once
     * an account is used: "count" reads them apart; "import" adds them to the
     * account's log in memory as one undoable step (import_dives, Subsurface's
     * merge rules: a dive already there is not doubled). The device's log
     * itself is kept as it is.
     */
    @PluginMethod
    fun deviceLog(call: PluginCall) = onCoreThread(call) {
        val exists = NativeCore.logExists(repo)
        when (call.getString("action")) {
            "exists" -> call.resolve(JSObject().put("exists", exists))
            "count" -> call.resolve(JSObject().put("count", if (exists) NativeCore.countDives(repo) else 0))
            "import" -> {
                if (!exists) {
                    call.reject("NO_DIVES", "NO_DIVES")
                    return@onCoreThread
                }
                call.resolve(JSObject().put("json", NativeCore.importDives(repo, "this device")))
            }
            else -> call.reject("BAD_REQUEST", "BAD_REQUEST")
        }
    }

    /** Filter presets of the log: list, save (undoable), delete (undoable). */
    @PluginMethod
    fun filterPresets(call: PluginCall) = onCoreThread(call) {
        val json = NativeCore.filterPresets(
            call.getString("action").orEmpty(),
            call.getString("name").orEmpty(),
            call.getString("fulltext").orEmpty(),
            call.getString("mode").orEmpty(),
            call.flatRules(),
            call.getInt("index") ?: -1,
        )
        call.resolve(JSObject().put("json", json))
    }

    /** Sync conflict after an automatic merge (read-only). */
    @PluginMethod
    fun syncConflicts(call: PluginCall) = onCoreThread(call, afterSetup = false) {
        call.resolve(JSObject().put("json", NativeCore.syncConflicts()))
    }

    /** Keeps the chosen side of each conflicting file ({path: "device"|"cloud"}), then reads the log again. */
    @PluginMethod
    fun resolveConflicts(call: PluginCall) = onCoreThread(call) {
        val choices = call.getObject("choices")
        if (choices == null) {
            call.reject("Missing choices", "BAD_ARGUMENT")
            return@onCoreThread
        }
        NativeCore.resolveConflicts(choices.toString())
        call.resolve()
    }

    /**
     * Read-only statistics (see benthic.h): kind "stats" with `criteria`
     * ({field: [values]}), or "values" with `field`.
     */
    @PluginMethod
    fun statsQuery(call: PluginCall) = onCoreThread(call) {
        val kind = call.getString("kind").orEmpty()
        val text = if (kind == "values") call.getString("field").orEmpty()
                   else (call.getObject("criteria") ?: JSObject()).toString()
        call.resolve(JSObject().put("json", NativeCore.statsQuery(kind, text)))
    }

    /** One undoable site change (see benthic.h): create, edit, geocode, merge, delete. */
    @PluginMethod
    fun siteAction(call: PluginCall) = onCoreThread(call) {
        val uuids = call.getArray("uuids")?.toList<Any>()?.map { (it as Number).toLong() }?.toLongArray()
        val json = NativeCore.siteAction(
            call.getString("action").orEmpty(),
            call.uuid("uuid"),
            call.uuid("other"),
            uuids,
            call.getString("field").orEmpty(),
            call.getString("value").orEmpty(),
            call.getInt("lat") ?: 0,
            call.getInt("lon") ?: 0,
            call.getString("country").orEmpty(),
            call.getString("region").orEmpty(),
            call.getString("county").orEmpty(),
            call.getString("city").orEmpty(),
        )
        call.resolve(JSObject().put("json", json))
    }

    // --- Download from a dive computer (Bluetooth) ------------------------------

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    }

    private val permissionAlias: String
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetooth" else "bluetoothLocation"

    private var scan: BluetoothScan? = null
    private var transport: BluetoothTransport? = null

    private fun bluetoothStatusObject(): JSObject {
        val adapter = bluetoothAdapter
        val state = getPermissionState(permissionAlias)
        return JSObject()
            .put("bluetooth", if (adapter == null) "none" else if (adapter.isEnabled) "on" else "off")
            .put("permission", when (state) {
                PermissionState.GRANTED -> "granted"
                PermissionState.DENIED -> "denied"
                else -> "prompt"
            })
    }

    /** {bluetooth: "none"|"off"|"on", permission: "granted"|"denied"|"prompt"}. */
    @PluginMethod
    fun bluetoothStatus(call: PluginCall) {
        call.resolve(bluetoothStatusObject())
    }

    /** Asks for the Bluetooth permissions of this Android version; resolves with bluetoothStatus. */
    @PluginMethod
    fun requestBluetoothPermission(call: PluginCall) {
        if (getPermissionState(permissionAlias) == PermissionState.GRANTED) {
            call.resolve(bluetoothStatusObject())
            return
        }
        requestPermissionForAlias(permissionAlias, call, "bluetoothPermissionResult")
    }

    @PermissionCallback
    private fun bluetoothPermissionResult(call: PluginCall) {
        val status = bluetoothStatusObject()
        Log.i(TAG, "Bluetooth permission: ${status.optString("permission")}")
        call.resolve(status)
    }

    /** The system dialog that turns Bluetooth on; resolves with bluetoothStatus. */
    @PluginMethod
    fun enableBluetooth(call: PluginCall) {
        if (bluetoothAdapter == null || bluetoothAdapter?.isEnabled == true) {
            call.resolve(bluetoothStatusObject())
            return
        }
        startActivityForResult(call, Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), "enableBluetoothResult")
    }

    @ActivityCallback
    private fun enableBluetoothResult(call: PluginCall, result: ActivityResult) {
        call.resolve(bluetoothStatusObject())
    }

    /**
     * The gauge camera: a full-screen camera (GaugeCameraActivity) that reads cylinder
     * pressures from a photo. `options` carries every visible text (title, subtitle,
     * hintMain, hintSub, flash, photos, photosDescription, shutter, manual, close,
     * nothingTitle, nothingText, permissionReason, permissionButton, permissionDenied,
     * cameraFailed) and `nothingRead` to open on the alert. Resolves with
     * {action: "cancelled"}, {action: "manual"} or {action: "photo", thumbnail (base64 JPEG),
     * blocks: [{text, left, top, right, bottom, confidence}]}.
     */
    @PluginMethod
    fun gaugeCamera(call: PluginCall) {
        val intent = Intent(context, GaugeCameraActivity::class.java)
        intent.putExtra("options", call.data.toString())
        startActivityForResult(call, intent, "gaugeCameraResult")
    }

    @ActivityCallback
    private fun gaugeCameraResult(call: PluginCall, result: ActivityResult) {
        val json = result.data?.getStringExtra("result")
        if (json == null) call.resolve(JSObject().put("action", "cancelled")) else call.resolve(JSObject(json))
    }

    /**
     * The QR scanner: a full-screen camera (QrScanActivity) that reads the codes of a dive or a
     * plan from another phone. Every visible text comes in the call's data. Resolves with
     * {action: "cancelled"} or {action: "done", codes: [...]}; the camera permission is asked there.
     */
    @PluginMethod
    fun qrScan(call: PluginCall) {
        val intent = Intent(context, QrScanActivity::class.java)
        intent.putExtra("options", call.data.toString())
        startActivityForResult(call, intent, "qrScanResult")
    }

    @ActivityCallback
    private fun qrScanResult(call: PluginCall, result: ActivityResult) {
        val json = result.data?.getStringExtra("result")
        if (json == null) call.resolve(JSObject().put("action", "cancelled")) else call.resolve(JSObject(json))
    }

    /**
     * The document scanner (DocumentScanActivity: ML Kit Document Scanner, then text recognition).
     * Resolves with {action: "cancelled"}, {action: "unavailable"} or {action: "done", image (base64 JPEG), text}.
     */
    @PluginMethod
    fun scanDocument(call: PluginCall) {
        val intent = Intent(context, DocumentScanActivity::class.java)
        startActivityForResult(call, intent, "scanDocumentResult")
    }

    @ActivityCallback
    private fun scanDocumentResult(call: PluginCall, result: ActivityResult) {
        val json = result.data?.getStringExtra("result")
        if (json == null) return call.resolve(JSObject().put("action", "cancelled"))
        val answer = JSObject(json)
        val path = answer.optString("path", "")
        if (path.isEmpty()) return call.resolve(answer)
        // The scan comes as a cache file (the Intent is too small for a picture): read it, hand it over as base64, delete it.
        Thread {
            try {
                val file = java.io.File(path)
                answer.put("image", android.util.Base64.encodeToString(file.readBytes(), android.util.Base64.NO_WRAP))
                answer.remove("path")
                file.delete()
                call.resolve(answer)
            } catch (e: Exception) {
                call.resolve(JSObject().put("action", "cancelled"))
            }
        }.start()
    }

    /** The brightness the window had before keepScreenAwake raised it (null when it is not raised). */
    private var savedBrightness: Float? = null

    /**
     * The sending screen of a QR share: the screen stays on and at full brightness while `on`,
     * and both are restored when it is off (or the window changes). Only this window is touched,
     * never the system setting.
     */
    @PluginMethod
    fun keepScreenAwake(call: PluginCall) {
        val on = call.getBoolean("on", false) == true
        activity.runOnUiThread {
            val window = activity.window
            val attrs = window.attributes
            if (on) {
                if (savedBrightness == null) savedBrightness = attrs.screenBrightness
                window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                attrs.screenBrightness = 1f
            } else {
                window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                attrs.screenBrightness = savedBrightness ?: android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                savedBrightness = null
            }
            window.attributes = attrs
            call.resolve()
        }
    }

    /** True when the installer is Google Play: the in-app review and the store page only make sense then. */
    @PluginMethod
    fun installSource(call: PluginCall) {
        val pkg = context.packageName
        val installer = try {
            if (Build.VERSION.SDK_INT >= 30) context.packageManager.getInstallSourceInfo(pkg).installingPackageName
            else @Suppress("DEPRECATION") context.packageManager.getInstallerPackageName(pkg)
        } catch (e: Exception) {
            null
        }
        call.resolve(JSObject().put("store", installer == "com.android.vending").put("installer", installer ?: ""))
    }

    /** The Play In-App Review flow; Google applies its own quota, so the dialog may not show. */
    @PluginMethod
    fun requestReview(call: PluginCall) {
        activity.runOnUiThread {
            val manager = com.google.android.play.core.review.ReviewManagerFactory.create(context)
            manager.requestReviewFlow().addOnCompleteListener { request ->
                if (!request.isSuccessful) {
                    call.resolve(JSObject().put("requested", false))
                    return@addOnCompleteListener
                }
                manager.launchReviewFlow(activity, request.result).addOnCompleteListener {
                    call.resolve(JSObject().put("requested", true))
                }
            }
        }
    }

    /** The app's Google Play page: market:// first, the https page when no store app answers. */
    @PluginMethod
    fun openStorePage(call: PluginCall) {
        val id = context.packageName
        try {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$id")))
        } catch (e: Exception) {
            activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$id")))
        }
        call.resolve()
    }

    /** The first screen is drawn: the launch screen can go (see SplashGate). */
    @PluginMethod
    fun contentShown(call: PluginCall) {
        SplashGate.contentShown = true
        call.resolve()
    }

    /** This app's page of the system settings, where a refused permission can be given. */
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    /**
     * Looks for dive computers for `durationMs` (default 60 s): each device
     * found comes as a "bluetoothDevice" event, {mac, name, le, classic,
     * bonded, rssi, computer (JSON: {vendor, product} or null)}; the end of
     * the scan as "bluetoothScanStopped". Rejects with NO_BLUETOOTH,
     * BLUETOOTH_OFF, PERMISSION.
     */
    @PluginMethod
    fun startBluetoothScan(call: PluginCall) {
        val adapter = bluetoothAdapter
        if (adapter == null) return call.reject("NO_BLUETOOTH", "NO_BLUETOOTH")
        if (getPermissionState(permissionAlias) != PermissionState.GRANTED) return call.reject("PERMISSION", "PERMISSION")
        if (!adapter.isEnabled) return call.reject("BLUETOOTH_OFF", "BLUETOOTH_OFF")
        val s = scan ?: BluetoothScan(
            adapter,
            onDevice = { notifyListeners("bluetoothDevice", it) },
            onStopped = { notifyListeners("bluetoothScanStopped", JSObject()) },
        ).also { scan = it }
        try {
            s.start(call.getLong("durationMs") ?: 60_000L)
            call.resolve()
        } catch (e: SecurityException) {
            call.reject("PERMISSION", "PERMISSION", e)
        }
    }

    @PluginMethod
    fun stopBluetoothScan(call: PluginCall) {
        scan?.stop()
        call.resolve()
    }

    /** Models that download over Bluetooth (dc_bluetooth_models), for a device whose name says nothing. */
    @PluginMethod
    fun bluetoothModels(call: PluginCall) {
        call.resolve(JSObject().put("json", NativeCore.dcBluetoothModels()))
    }

    /**
     * Downloads the new dives of a dive computer and adds them to the logbook
     * as one undoable step (download_dives in benthic.h): {vendor, product,
     * address ("LE:" + MAC, or the MAC for Bluetooth Classic), name,
     * forceDownload, defaultSalinity (water type for dives without one, 0 for none)}. Progress comes as "downloadProgress" events ({json}).
     * The screen stays on meanwhile. libdivecomputer's log is written to
     * files/libdivecomputer.log; after a failure, its end goes to logcat.
     */
    @PluginMethod
    fun downloadDives(call: PluginCall) {
        val adapter = bluetoothAdapter
        if (adapter == null) return call.reject("NO_BLUETOOTH", "NO_BLUETOOTH")
        if (getPermissionState(permissionAlias) != PermissionState.GRANTED) return call.reject("PERMISSION", "PERMISSION")
        if (!adapter.isEnabled) return call.reject("BLUETOOTH_OFF", "BLUETOOTH_OFF")
        // As Subsurface (getBtDeviceInfo): the scan stops before connecting.
        val s = scan
        s?.stop()
        val t = transport ?: BluetoothTransport(context, adapter) { mac -> scan?.device(mac) }.also { transport = it }
        t.reset()
        val request = JSObject()
            .put("classicAddress", call.getString("classicAddress").orEmpty())
            .put("vendor", call.getString("vendor").orEmpty())
            .put("product", call.getString("product").orEmpty())
            .put("address", call.getString("address").orEmpty())
            .put("name", call.getString("name").orEmpty())
            .put("forceDownload", call.getBoolean("forceDownload", false) == true)
            .put("defaultSalinity", call.getInt("defaultSalinity", 0) ?: 0)
        val logFile = File(context.filesDir, LIBDC_LOG)
        request.put("logFile", logFile.absolutePath)
        keepScreenOn(true)
        coreThread.execute {
            val start = System.currentTimeMillis()
            try {
                Log.i(TAG, "downloadDives: $request")
                val json = NativeCore.downloadDives(request.toString(), t) { progress ->
                    notifyListeners("downloadProgress", JSObject().put("json", progress))
                }
                Log.i(TAG, "downloadDives: done in ${System.currentTimeMillis() - start} ms: $json")
                call.resolve(JSObject().put("json", json))
            } catch (e: Exception) {
                Log.e(TAG, "downloadDives failed after ${System.currentTimeMillis() - start} ms: ${e.message}")
                logTail(logFile)
                call.reject(e.message, "CORE_ERROR", e)
            } finally {
                keepScreenOn(false)
            }
        }
    }

    /**
     * The dives received before a download failed or was cancelled
     * (download_partial): action "count" ({dives}), "keep" (one undoable
     * step, the object of downloadDives) or "discard".
     */
    @PluginMethod
    fun downloadPartial(call: PluginCall) = onCoreThread(call) {
        val action = call.getString("action").orEmpty()
        val json = NativeCore.downloadPartial(action)
        Log.i(TAG, "downloadPartial($action): $json")
        call.resolve(JSObject().put("json", json))
    }

    /** Stops the running download (off the core thread, which is busy with it). */
    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        Log.i(TAG, "cancelDownload")
        NativeCore.downloadCancel()
        transport?.cancel()
        call.resolve()
    }

    private fun keepScreenOn(on: Boolean) {
        val activity = activity ?: return
        activity.runOnUiThread {
            if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    /** The end of libdivecomputer's log, to diagnose a failed download with `adb logcat -s Benthic`. */
    private fun logTail(file: File) {
        if (!file.exists()) return
        try {
            val lines = file.readLines()
            Log.i(TAG, "--- end of ${file.name} (${lines.size} lines) ---")
            for (line in lines.takeLast(200)) Log.i(TAG, "libdc: $line")
        } catch (e: Exception) {
            Log.w(TAG, "Cannot read ${file.name}", e)
        }
    }

    private fun readSetting(fileName: String, key: String): String {
        val file = File(context.filesDir, fileName)
        if (!file.exists()) return ""
        return file.readLines().map { it.trim() }.firstOrNull { it.startsWith("$key=") }?.substringAfter('=').orEmpty()
    }

    private fun readTestEmail(): String {
        val file = File(context.filesDir, TEST_ACCOUNT)
        if (!file.exists()) return ""
        return file.readLines().map { it.trim() }
            .firstOrNull { it.startsWith("BENTHIC_CLOUD_TEST_EMAIL=") }
            ?.substringAfter('=').orEmpty()
    }

    /** The stored account, else the development credentials. */
    private fun accountCredentials(): Pair<String, String>? = credentialStore.read() ?: readDevCredentials()

    /** After a failed sign-in: the account of this device again, if any. */
    private fun configureStoredAccount() {
        val credentials = accountCredentials()
        try {
            NativeCore.cloudConfigure(credentials?.first.orEmpty(), credentials?.second.orEmpty())
        } catch (e: IllegalStateException) {
            // No account: none is set.
        }
    }

    private fun readDevCredentials(): Pair<String, String>? {
        val file = File(context.filesDir, DEV_CREDENTIALS)
        if (!file.exists()) return null
        val values = file.readLines()
            .map { it.trim() }
            .filter { it.contains('=') && !it.startsWith("#") }
            .associate { it.substringBefore('=') to it.substringAfter('=') }
        val email = values["BENTHIC_CLOUD_EMAIL"].orEmpty()
        val password = values["BENTHIC_CLOUD_PASSWORD"].orEmpty()
        return if (email.isEmpty() || password.isEmpty()) null else email to password
    }

    /**
     * Writes Android's trusted authorities (system and user) as PEM; -1 when the
     * file already holds them.
     */
    /**
     * Development builds only: the authority of a development server (assets/dev-ca.pem, which is not in git) is trusted
     * as well, in a file of its own next to the exported one. A release build never reads it.
     */
    private fun withDevAuthority(caFile: File): File {
        if ((context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) return caFile
        return try {
            val dev = context.assets.open("dev-ca.pem").use { it.readBytes() }
            val combined = File(context.cacheDir, "cacerts-dev.pem")
            combined.writeBytes(caFile.readBytes() + "\n".toByteArray() + dev)
            combined
        } catch (e: java.io.IOException) {
            caFile
        }
    }

    private fun exportSystemCertificates(target: File): Int {
        val store = KeyStore.getInstance("AndroidCAStore")
        store.load(null, null)
        // Converting the certificates is what takes time (about 0.5 s). The aliases name
        // each authority by its hash, so the same list on the same system build
        // means the same file: it is kept from one start to the next.
        val aliases = store.aliases().toList().sorted()
        val key = Build.FINGERPRINT + "\n" + aliases.joinToString("\n")
        val keyFile = File(target.parentFile, target.name + ".key")
        if (target.length() > 0 && keyFile.exists() && keyFile.readText() == key) return -1
        var count = 0
        val pem = StringBuilder()
        for (alias in aliases) {
            val cert = store.getCertificate(alias) as? X509Certificate ?: continue
            pem.append("-----BEGIN CERTIFICATE-----\n")
            pem.append(Base64.encodeToString(cert.encoded, Base64.DEFAULT))
            pem.append("-----END CERTIFICATE-----\n")
            count++
        }
        val tmp = File(target.parentFile, target.name + ".tmp")
        tmp.writeText(pem.toString())
        tmp.renameTo(target)
        keyFile.writeText(key)
        return count
    }

    /**
     * `afterSetup` false: the call neither reaches the network nor needs the
     * regions, and does not wait for the certificates (start of the logbook).
     */
    private fun onCoreThread(call: PluginCall, afterSetup: Boolean = true, block: () -> Unit) {
        coreThread.execute {
            try {
                if (afterSetup) setupDone.await()
                block()
            } catch (e: Exception) {
                Log.e(TAG, "Core error", e)
                call.reject(e.message, "CORE_ERROR", e)
            }
        }
    }

    // --- A file sent to the app (deep links, "Open with Benthic") ------------

    /** « Share to Benthic » while the app runs (singleTask: the new intent arrives here). */
    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        offerSharedFiles(intent)
    }

    /**
     * An ACTION_SEND or ACTION_SEND_MULTIPLE intent carries the files in EXTRA_STREAM (content:// addresses
     * the sender granted read access to). Each one goes to the web layer as a "sharedFile" event ({uri}), kept
     * until a listener exists (cold start); the web layer reads it with readSharedFile and decides whether it is
     * a logbook. An ACTION_VIEW is left to Capacitor's "appUrlOpen". The intent is replaced afterwards so that
     * a restart of the activity does not offer the same file again.
     */
    private fun offerSharedFiles(intent: Intent?) {
        if (intent == null) return
        val uris = ArrayList<Uri>()
        @Suppress("DEPRECATION")
        when (intent.action) {
            Intent.ACTION_SEND -> {
                val one = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
                if (one != null) uris.add(one)
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val many = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                if (many != null) uris.addAll(many)
            }
            else -> return
        }
        // Text shared without a file (EXTRA_TEXT only) is not ours.
        for (uri in uris) {
            if (uri.scheme != "content") continue
            notifyListeners("sharedFile", JSObject().put("uri", uri.toString()), true)
        }
        activity?.intent = Intent(Intent.ACTION_MAIN)
    }

    /**
     * A file another app handed to Benthic (a content:// address: "Share to", "Open with"): streamed, in
     * pieces of 64 KB, into a file of the app's cache; {name, size, path}. The name is the provider's display
     * name (OpenableColumns), "" when it gives none. Nothing but the path crosses the bridge: a logbook of 100 MB
     * as one base64 string ran the Java heap (256 MB) out of memory. The web layer looks at the beginning with
     * readFileChunk, and imports with importDives({path}), which deletes the file. Rejects TOO_BIG above 2 GB or
     * when the device lacks the room, NOT_FOUND, FAILED. Not on the core thread: reading from Drive may be slow.
     */
    @PluginMethod
    fun stageSharedFile(call: PluginCall) {
        val text = call.getString("uri")
        if (text.isNullOrEmpty()) {
            call.reject("Missing uri", "BAD_ARGUMENT")
            return
        }
        Thread {
            var target: File? = null
            try {
                val uri = Uri.parse(text)
                // content:// only: a file:// address could point into the app's own private files.
                if (uri.scheme != "content") {
                    call.reject("Not a file", "BAD_ARGUMENT")
                    return@Thread
                }
                var name = ""
                var expected = 0L
                try {
                    context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME, android.provider.OpenableColumns.SIZE), null, null, null)?.use { c ->
                        if (c.moveToFirst()) {
                            name = c.getString(0).orEmpty()
                            if (!c.isNull(1)) expected = maxOf(0L, c.getLong(1))
                        }
                    }
                } catch (e: Exception) {
                    // No display name or size: the web layer names the import from its contents; the progress has no total.
                }
                if (name.isEmpty()) name = uri.lastPathSegment.orEmpty().substringAfterLast('/')
                val input = context.contentResolver.openInputStream(uri)
                if (input == null) {
                    call.reject("Cannot open the file", "NOT_FOUND")
                    return@Thread
                }
                val file = newStagedFile(name)
                target = file
                var size = 0L
                var reported = 0L
                var reportedAt = 0L
                cancelledStages.remove(text)
                input.use { stream ->
                    java.io.FileOutputStream(file).use { out ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val n = stream.read(buffer)
                            if (n < 0) break
                            out.write(buffer, 0, n)
                            size += n
                            if (size > MAX_SHARED_FILE) throw java.io.IOException("TOO_BIG")
                            if (cancelledStages.contains(text)) throw java.io.IOException("CANCELLED")
                            // Progress for the web layer: at most every 100 ms, and at least 256 KB apart.
                            val now = System.currentTimeMillis()
                            if (now - reportedAt >= 100 && size - reported >= 256 * 1024) {
                                reported = size
                                reportedAt = now
                                notifyListeners("stageProgress", JSObject().put("uri", text).put("done", size).put("total", maxOf(expected, size)))
                            }
                        }
                    }
                }
                notifyListeners("stageProgress", JSObject().put("uri", text).put("done", size).put("total", size))
                call.resolve(JSObject().put("name", name).put("size", size).put("path", file.absolutePath))
            } catch (e: SecurityException) {
                target?.delete()
                call.reject("Cannot open the file", "NOT_FOUND", e)
            } catch (e: Exception) {
                target?.delete()
                if (e.message == "CANCELLED") {
                    call.reject("Cancelled", "CANCELLED")
                    return@Thread
                }
                Log.e(TAG, "stageSharedFile", e)
                val tooBig = e.message == "TOO_BIG" || e.message?.contains("ENOSPC") == true
                call.reject(if (tooBig) "The file is too big" else "Cannot read the file", if (tooBig) "TOO_BIG" else "FAILED", e)
            }
        }.start()
    }

    /** The addresses whose copy (stageSharedFile) the diver cancelled; the copy stops at its next piece and rejects CANCELLED. */
    private val cancelledStages = java.util.Collections.synchronizedSet(HashSet<String>())

    /** « Annuler » on the import progress: stops the copy of `uri` and deletes the partial file. */
    @PluginMethod
    fun cancelStage(call: PluginCall) {
        val text = call.getString("uri")
        if (!text.isNullOrEmpty()) cancelledStages.add(text)
        call.resolve()
    }

    /**
     * Small files only (at most 8 MB, as base64 in the answer; a bigger one rejects TOO_BIG): the bytes of a
     * content:// file. The shared logbooks go through stageSharedFile.
     */
    @PluginMethod
    fun readSharedFile(call: PluginCall) {
        val text = call.getString("uri")
        if (text.isNullOrEmpty()) {
            call.reject("Missing uri", "BAD_ARGUMENT")
            return
        }
        Thread {
            try {
                val uri = Uri.parse(text)
                // content:// only: a file:// address could point into the app's own private files.
                if (uri.scheme != "content") {
                    call.reject("Not a file", "BAD_ARGUMENT")
                    return@Thread
                }
                var name = ""
                try {
                    context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                        if (c.moveToFirst()) name = c.getString(0).orEmpty()
                    }
                } catch (e: Exception) {
                    // No display name: the web layer names the import from its contents.
                }
                if (name.isEmpty()) name = uri.lastPathSegment.orEmpty().substringAfterLast('/')
                val input = context.contentResolver.openInputStream(uri)
                if (input == null) {
                    call.reject("Cannot open the file", "NOT_FOUND")
                    return@Thread
                }
                val bytes = input.use { stream ->
                    val out = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = stream.read(buffer)
                        if (n < 0) break
                        out.write(buffer, 0, n)
                        if (out.size() > MAX_INLINE_FILE) {
                            call.reject("The file is too big", "TOO_BIG")
                            return@Thread
                        }
                    }
                    out.toByteArray()
                }
                call.resolve(
                    JSObject()
                        .put("name", name)
                        .put("size", bytes.size)
                        .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)),
                )
            } catch (e: SecurityException) {
                call.reject("Cannot open the file", "NOT_FOUND", e)
            } catch (e: Exception) {
                Log.e(TAG, "readSharedFile", e)
                call.reject("Cannot read the file", "FAILED", e)
            }
        }.start()
    }

    // --- Sharing a dive (spec, section 4, "Dive detail", "Partager") ---------

    /** A file to share (the profile image): written in the cache, shared through the FileProvider. */
    @PluginMethod
    fun writeShareFile(call: PluginCall) {
        val name = call.getString("name")
        val data = call.getString("base64")
        if (name.isNullOrEmpty() || data == null) {
            call.reject("Missing name or data", "BAD_ARGUMENT")
            return
        }
        try {
            val dir = File(context.cacheDir, SHARE_DIR).apply { mkdirs() }
            val file = File(dir, File(name).name)
            file.writeBytes(Base64.decode(data, Base64.DEFAULT))
            call.resolve(JSObject().put("uri", Uri.fromFile(file).toString()))
        } catch (e: Exception) {
            Log.e(TAG, "writeShareFile", e)
            call.reject("Cannot write the file", "FAILED")
        }
    }

    /**
     * Read access to a shared file for every app that can receive it, granted
     * before the share sheet opens. The share sheet's own grant lasts only
     * while the receiving screen is open; Gmail sends its attachments later,
     * in the background, and lost the file (the mail arrived with a broken
     * attachment). The grant lasts until the device restarts; the files are
     * the app's cache copies of what the diver chose to share.
     */
    @PluginMethod
    fun grantShareFile(call: PluginCall) {
        val path = call.getString("uri")?.let { Uri.parse(it).path }
        val mime = call.getString("mime") ?: "*/*"
        if (path == null) {
            call.reject("Missing uri", "BAD_ARGUMENT")
            return
        }
        try {
            val uri = androidx.core.content.FileProvider.getUriForFile(context, context.packageName + ".fileprovider", File(path))
            val send = Intent(Intent.ACTION_SEND).setType(mime)
            val targets = context.packageManager.queryIntentActivities(send, 0).map { it.activityInfo.packageName }.toSet()
            for (target in targets) context.grantUriPermission(target, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            call.resolve(JSObject().put("apps", targets.size))
        } catch (e: Exception) {
            Log.e(TAG, "grantShareFile", e)
            call.reject("Cannot grant access to the file", "FAILED")
        }
    }

    /**
     * "Exporter au format…": the dives exported by the core (export_dives)
     * into the cache, shared from there; read only for the logbook.
     */
    @PluginMethod
    fun exportDives(call: PluginCall) = onCoreThread(call) {
        val ids = call.getArray("ids")?.toList<Int>()?.toIntArray() ?: IntArray(0)
        val format = call.getString("format").orEmpty()
        val name = call.getString("name").orEmpty()
        if (ids.isEmpty() || format.isEmpty() || name.isEmpty()) {
            call.reject("Missing ids, format or name", "BAD_ARGUMENT")
            return@onCoreThread
        }
        if (call.getBoolean("stage", false) == true) {
            // Written where the import calls read it (a staged file): the core writes the file and only its
            // path comes back. The caller imports it, reads it in pieces or deletes it (discardImport).
            val staged = newStagedFile(name)
            NativeCore.exportDives(ids, format, call.getBoolean("anonymize", false) == true, staged.absolutePath)
            call.resolve(JSObject().put("uri", "").put("path", staged.absolutePath).put("size", staged.length()))
            return@onCoreThread
        }
        val dir = File(context.cacheDir, SHARE_DIR).apply { mkdirs() }
        val file = File(dir, File(name).name)
        NativeCore.exportDives(ids, format, call.getBoolean("anonymize", false) == true, file.absolutePath)
        if (call.getBoolean("text", false) == true) {
            // The contents come back in the answer (the QR share, a few dives): the file is not kept. A big
            // export never goes through the bridge as a string (it ran the Java heap out of memory).
            if (file.length() > MAX_INLINE_FILE) {
                file.delete()
                call.reject("The export is too big to be returned as text", "TOO_BIG")
                return@onCoreThread
            }
            val text = file.readText(Charsets.UTF_8)
            file.delete()
            call.resolve(JSObject().put("uri", "").put("text", text))
            return@onCoreThread
        }
        call.resolve(JSObject().put("uri", Uri.fromFile(file).toString()))
    }

    /** The WebView rendering a PDF: kept until the PDF is written. */
    private var pdfView: android.webkit.WebView? = null

    /**
     * A page of HTML (the dive sheet) rendered to a PDF in the cache by the
     * system's print engine, without network or dialog; US Letter or A4.
     */
    @PluginMethod
    fun htmlToPdf(call: PluginCall) {
        val html = call.getString("html")
        val name = call.getString("name")
        if (html == null || name.isNullOrEmpty()) {
            call.reject("Missing html or name", "BAD_ARGUMENT")
            return
        }
        val letter = call.getBoolean("letter", false) == true
        activity.runOnUiThread {
            val view = android.webkit.WebView(context)
            pdfView = view
            view.settings.javaScriptEnabled = false
            view.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(page: android.webkit.WebView, url: String?) {
                    val attributes = android.print.PrintAttributes.Builder()
                        .setMediaSize(if (letter) android.print.PrintAttributes.MediaSize.NA_LETTER else android.print.PrintAttributes.MediaSize.ISO_A4)
                        .setResolution(android.print.PrintAttributes.Resolution("pdf", "pdf", 600, 600))
                        .setMinMargins(android.print.PrintAttributes.Margins.NO_MARGINS)
                        .build()
                    val dir = File(context.cacheDir, SHARE_DIR).apply { mkdirs() }
                    val file = File(dir, File(name).name)
                    android.print.PdfPrint(attributes).print(page.createPrintDocumentAdapter(name), file) { ok ->
                        page.destroy()
                        pdfView = null
                        if (ok) call.resolve(JSObject().put("uri", Uri.fromFile(file).toString()))
                        else call.reject("Cannot render the PDF", "FAILED")
                    }
                }
            }
            view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
        }
    }

    private companion object {
        const val TAG = "Benthic"
        const val SHARE_DIR = "share"
        const val MAX_SHARED_FILE = 2L * 1024 * 1024 * 1024
        /** The most a call may carry as a string (base64 or text) across the bridge. */
        const val MAX_INLINE_FILE = 8 * 1024 * 1024
        const val MAX_CHUNK = 4 * 1024 * 1024
        const val XSLT_DIR = "xslt"
        const val CERTIFICATES_RECHECK_MS = 20_000L
        const val SAMPLE_ASSET = "SampleDivesV2.ssrf"
        const val DEV_CREDENTIALS = "cloud-dev.env"
        const val TEST_ACCOUNT = "cloud-test.env"
        const val IMPORT_PREFIX = "import-"
        const val LIBDC_LOG = "libdivecomputer.log"
    }
}
