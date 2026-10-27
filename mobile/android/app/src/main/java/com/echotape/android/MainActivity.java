package com.echotape.android;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.Nullable;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Android-native EchoTape UI. This activity does not create or load a WebView. */
public class MainActivity extends AppCompatActivity {
    private static final int MAX_SUBTITLE_BYTES = 20 * 1024 * 1024;
    private static final int CREAM = Color.rgb(244, 233, 216);
    private static final int CREAM_LIGHT = Color.rgb(252, 246, 234);
    private static final int ESPRESSO = Color.rgb(46, 33, 28);
    private static final int MUTED = Color.rgb(124, 97, 83);
    private static final int RUST = Color.rgb(191, 91, 46);
    private static final String PREFS = "echotape.native.ui";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();
    private final List<Cue> cues = new ArrayList<>();
    private final List<String> blockedWords = new ArrayList<>();
    private RecentStore.Library recentLibrary;

    private LinearLayout header;
    private LinearLayout bottomNav;
    private ScrollView playScroll;
    private LinearLayout cuePage;
    private ScrollView settingsScroll;
    private final List<TextView> navItems = new ArrayList<>();

    private TextView voiceStatus;
    private TextView playTitle;
    private TextView playStatus;
    private TextView currentCueText;
    private TextView currentCueTime;
    private TextView timeCurrent;
    private TextView timeDuration;
    private TextView playButton;
    private TextView autoModeButton;
    private LinearLayout quickStartCard;
    private TextView queueCount;
    private LinearLayout queueCard;
    private SeekBar timeline;
    private boolean timelineTouched;
    private TextView audioCardTitle;
    private TextView audioCardMeta;
    private TextView subtitleCardTitle;
    private TextView subtitleCardMeta;
    private TextView skipSpeechButton;
    private Button recentLibraryButton;

    private TextView cueFileTitle;
    private TextView cueFileMeta;
    private TextView cueCurrentText;
    private TextView cueCurrentTime;
    private LinearLayout cueRowsContainer;
    private ScrollView cueRowsScroll;
    private EditText cueSearch;
    private TextView cueEmpty;
    private final List<TextView> cueRows = new ArrayList<>();
    private final List<Integer> cueRowsIndexes = new ArrayList<>();

    private Switch autoPauseSwitch;
    private Spinner voiceSpinner;
    private TextView ttsStateText;
    private TextView ttsRateValue;
    private TextView ttsVolumeValue;
    private TextView ttsPitchValue;
    private TextView playbackRateValue;
    private TextView offsetValue;
    private RadioGroup expiredGroup;
    private RadioGroup triggerModeGroup;
    private SeekBar ttsRateBar;
    private SeekBar ttsVolumeBar;
    private SeekBar ttsPitchBar;
    private SeekBar playbackRateBar;
    private EditText blockedWordInput;
    private LinearLayout blockedWordsContainer;
    private boolean bindingSettings;

    private String audioUri = "";
    private String audioName = "";
    private long audioSize;
    private String subtitleUri = "";
    private String subtitleName = "";
    private String subtitleFormat = "";
    private String subtitleEncoding = "";
    private List<String> subtitleWarnings = new ArrayList<>();
    private JSONArray nativeVoices = new JSONArray();
    private int selectedVoiceIndex = 0;

    private boolean autoPause = true;
    private int offsetMs;
    private float ttsRate = 1f;
    private float ttsVolume = 1f;
    private float ttsPitch = 1f;
    private float playbackRate = 1f;
    private String expiredPolicy = "read-all";
    private String triggerMode = "end";
    private String voiceName = "";

    private String transport = "idle";
    private String speech = "idle";
    private int activeCue = -1;
    private int lastBlockedCue = -1;
    private int pointer;
    private int pendingSpeech;
    private long positionMs;
    private long durationMs;
    private boolean ttsReady;
    private String lastError = "";
    private String shownError = "";
    private int lastRenderedCue = -2;
    private int lastRenderedPointer = -2;
    private boolean sessionRestored;
    private int serviceAttempts;
    private SharedPreferences prefs;
    private boolean openingTtsSettings;
    private ActivityResultLauncher<String[]> audioPicker;
    private ActivityResultLauncher<String[]> subtitlePicker;

    private final EchoPlaybackBus.Listener playbackListener = new EchoPlaybackBus.Listener() {
        @Override
        public void onPlaybackState(JSONObject state) {
            ui.post(() -> applyPlaybackState(state));
        }

        @Override
        public void onQueueCleared(int count, String reason) {
            ui.post(
                () ->
                    Toast.makeText(
                        MainActivity.this,
                        "mode-switch".equals(reason)
                            ? "已清空 " + count + " 条旧朗读，后续字幕将在原声到达后处理"
                            : "已清空 " + count + " 条朗读",
                        Toast.LENGTH_SHORT
                    ).show()
            );
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(CREAM);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        loadPreferences();
        recentLibrary = RecentStore.load(this);
        registerDocumentPickers();
        setContentView(buildRoot());
        bindStaticActions();
        renderRecentLibrary();
        showTab("player");
        EchoPlaybackService.ensureStarted(this);
        connectService();
    }

    @Override
    protected void onStart() {
        super.onStart();
        EchoPlaybackBus.addListener(playbackListener);
    }

    @Override
    protected void onStop() {
        EchoPlaybackBus.removeListener(playbackListener);
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (openingTtsSettings) {
            openingTtsSettings = false;
            ui.postDelayed(
                () -> withService(EchoPlaybackService::retryTts),
                350
            );
        }
    }

    @Override
    protected void onDestroy() {
        ioExecutor.shutdownNow();
        super.onDestroy();
    }

    private View buildRoot() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(CREAM);

        header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(18), dp(12), dp(18), dp(10));
        root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.ic_echo_tape_mark);
        mark.setScaleType(ImageView.ScaleType.FIT_CENTER);
        mark.setPadding(dp(6), dp(6), dp(6), dp(6));
        mark.setBackground(rounded(RUST, 18, Color.TRANSPARENT, 0));
        header.addView(mark, new LinearLayout.LayoutParams(dp(46), dp(46)));

        LinearLayout brand = column();
        brand.setPadding(dp(11), 0, 0, 0);
        TextView title = text("译声机", 21, ESPRESSO, Typeface.BOLD);
        title.setTypeface(Typeface.create("serif", Typeface.BOLD));
        TextView subtitle = text("ECHOTAPE · ANDROID NATIVE", 8.5f, MUTED, Typeface.BOLD);
        subtitle.setLetterSpacing(0.16f);
        brand.addView(title);
        brand.addView(subtitle);
        header.addView(brand, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        voiceStatus = text("正在检查语音", 10.5f, MUTED, Typeface.BOLD);
        voiceStatus.setGravity(Gravity.CENTER);
        voiceStatus.setPadding(dp(10), dp(7), dp(10), dp(7));
        voiceStatus.setBackground(rounded(CREAM_LIGHT, 30, Color.argb(38, 46, 33, 28), 1));
        header.addView(voiceStatus, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout pageFrame = new FrameLayout(this);
        root.addView(pageFrame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        playScroll = new ScrollView(this);
        playScroll.setFillViewport(true);
        playScroll.setClipToPadding(false);
        playScroll.addView(buildPlayPage());
        pageFrame.addView(playScroll);

        cuePage = buildCuePage();
        cuePage.setVisibility(View.GONE);
        pageFrame.addView(
            cuePage,
            new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );

        settingsScroll = new ScrollView(this);
        settingsScroll.setFillViewport(true);
        settingsScroll.setClipToPadding(false);
        settingsScroll.addView(buildSettingsPage());
        settingsScroll.setVisibility(View.GONE);
        pageFrame.addView(settingsScroll);

        bottomNav = new LinearLayout(this);
        bottomNav.setOrientation(LinearLayout.HORIZONTAL);
        bottomNav.setGravity(Gravity.CENTER);
        bottomNav.setPadding(dp(32), dp(5), dp(32), dp(5));
        bottomNav.setBackgroundColor(Color.rgb(247, 237, 220));
        bottomNav.setElevation(dp(10));
        String[] labels = { "播放", "字幕", "设置" };
        String[] icons = { "●", "▤", "⚙" };
        String[] tabs = { "player", "cues", "settings" };
        for (int i = 0; i < labels.length; i++) {
            TextView item = text(icons[i] + "\n" + labels[i], 11, MUTED, Typeface.BOLD);
            item.setGravity(Gravity.CENTER);
            item.setLineSpacing(0, 0.86f);
            item.setTag(tabs[i]);
            item.setOnClickListener(view -> showTab((String) view.getTag()));
            navItems.add(item);
            bottomNav.addView(item, new LinearLayout.LayoutParams(0, dp(58), 1));
        }
        root.addView(bottomNav, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            header.setPadding(dp(18), bars.top + dp(10), dp(18), dp(10));
            bottomNav.setPadding(dp(32), dp(5), dp(32), bars.bottom + dp(5));
            return insets;
        });
        return root;
    }

    private LinearLayout buildQuickStartCard() {
        LinearLayout card = card();
        LinearLayout heading = row();
        heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("快捷操作", 16, ESPRESSO, Typeface.BOLD);
        title.setTypeface(Typeface.create("serif", Typeface.BOLD));
        heading.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView badge = text("不用重复添加", 9.5f, RUST, Typeface.BOLD);
        badge.setPadding(dp(8), dp(4), dp(8), dp(4));
        badge.setBackground(rounded(Color.argb(22, 191, 91, 46), 20, Color.TRANSPARENT, 0));
        heading.addView(badge);
        card.addView(heading);
        card.addView(
            text("选择音频和字幕后即可播放；最近使用可从下方独立入口打开", 11.5f, MUTED, Typeface.NORMAL),
            topMarginParams(0, dp(7))
        );

        LinearLayout actions = row();
        actions.setPadding(0, dp(10), 0, 0);
        Button audio = smallButton("选择音频");
        audio.setOnClickListener(view -> pickAudio());
        Button subtitle = smallButton("选择字幕");
        subtitle.setOnClickListener(view -> pickSubtitle());
        actions.addView(audio, new LinearLayout.LayoutParams(0, dp(44), 1));
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(0, dp(44), 1);
        subtitleParams.leftMargin = dp(8);
        actions.addView(subtitle, subtitleParams);
        recentLibraryButton = smallButton("最近");
        recentLibraryButton.setOnClickListener(view -> showRecentLibraryDialog());
        LinearLayout.LayoutParams recentParams = new LinearLayout.LayoutParams(0, dp(44), 0.85f);
        recentParams.leftMargin = dp(8);
        actions.addView(recentLibraryButton, recentParams);
        card.addView(actions);
        return card;
    }

    private View buildPlayPage() {
        LinearLayout page = column();
        page.setPadding(dp(16), dp(8), dp(16), dp(28));

        quickStartCard = buildQuickStartCard();
        page.addView(
            quickStartCard,
            topMarginParams(0, 0, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        );

        LinearLayout hero = column();
        hero.setPadding(dp(20), dp(18), dp(20), dp(14));
        hero.setBackground(rounded(ESPRESSO, 28, Color.TRANSPARENT, 0));
        page.addView(hero, topMarginParams(0, dp(12), ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout statusRow = row();
        statusRow.setGravity(Gravity.TOP);
        LinearLayout names = column();
        TextView now = text("NOW PLAYING", 9, Color.rgb(199, 164, 107), Typeface.BOLD);
        now.setLetterSpacing(0.18f);
        playTitle = text("还没有装入音频", 18, CREAM_LIGHT, Typeface.BOLD);
        playTitle.setMaxLines(1);
        names.addView(now);
        names.addView(playTitle);
        statusRow.addView(names, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        playStatus = text("等待开始", 10.5f, Color.argb(190, 252, 246, 234), Typeface.BOLD);
        playStatus.setGravity(Gravity.CENTER);
        playStatus.setPadding(dp(10), dp(6), dp(10), dp(6));
        playStatus.setBackground(rounded(Color.argb(24, 252, 246, 234), 20, Color.TRANSPARENT, 0));
        statusRow.addView(playStatus);
        hero.addView(statusRow);

        LinearLayout cueBox = column();
        cueBox.setPadding(dp(14), dp(13), dp(14), dp(13));
        cueBox.setBackground(rounded(Color.argb(15, 252, 246, 234), 18, Color.TRANSPARENT, 0));
        hero.addView(cueBox, topMarginParams(0, dp(18)));
        currentCueTime = text("SUBTITLE CUE", 8.5f, Color.argb(110, 252, 246, 234), Typeface.BOLD);
        currentCueText = text("先装入外语音频和中文字幕", 17, CREAM_LIGHT, Typeface.BOLD);
        currentCueText.setLineSpacing(dp(3), 1f);
        cueBox.addView(currentCueTime);
        cueBox.addView(currentCueText);

        timeline = new SeekBar(this);
        timeline.setMax(1000);
        timeline.setProgressTintList(ColorStateList.valueOf(RUST));
        timeline.setThumbTintList(ColorStateList.valueOf(CREAM_LIGHT));
        timeline.setProgressBackgroundTintList(ColorStateList.valueOf(Color.argb(45, 252, 246, 234)));
        timeline.setPadding(0, dp(14), 0, 0);
        hero.addView(timeline, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));

        LinearLayout times = row();
        timeCurrent = text("00:00", 10, Color.argb(130, 252, 246, 234), Typeface.NORMAL);
        timeDuration = text("--:--", 10, Color.argb(130, 252, 246, 234), Typeface.NORMAL);
        times.addView(timeCurrent, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        times.addView(timeDuration, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        hero.addView(times);

        LinearLayout controls = row();
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(0, dp(8), 0, dp(8));
        TextView previous = roundControl("‹", 24);
        previous.setContentDescription("上一条字幕");
        previous.setOnClickListener(view -> moveCue(-1));
        controls.addView(previous, new LinearLayout.LayoutParams(dp(52), dp(52)));

        playButton = text("▶", 30, CREAM_LIGHT, Typeface.BOLD);
        playButton.setGravity(Gravity.CENTER);
        playButton.setBackground(rounded(RUST, 38, Color.TRANSPARENT, 0));
        playButton.setElevation(dp(8));
        playButton.setOnClickListener(view -> onPlayButton());
        LinearLayout.LayoutParams playParams = new LinearLayout.LayoutParams(dp(76), dp(76));
        playParams.leftMargin = dp(28);
        playParams.rightMargin = dp(28);
        controls.addView(playButton, playParams);

        TextView next = roundControl("›", 24);
        next.setContentDescription("下一条字幕");
        next.setOnClickListener(view -> moveCue(1));
        controls.addView(next, new LinearLayout.LayoutParams(dp(52), dp(52)));
        hero.addView(controls);

        LinearLayout secondary = row();
        secondary.setGravity(Gravity.CENTER);
        secondary.setPadding(0, dp(8), 0, 0);
        TextView replay = secondaryButton("↺  重播");
        replay.setOnClickListener(view -> replayAudio());
        TextView stop = secondaryButton("■  停止");
        stop.setOnClickListener(view -> withService(EchoPlaybackService::stop));
        autoModeButton = secondaryButton("◷  自动暂停");
        autoModeButton.setOnClickListener(view -> setAutoPause(!autoPause));
        secondary.addView(replay, new LinearLayout.LayoutParams(0, dp(42), 1));
        secondary.addView(stop, new LinearLayout.LayoutParams(0, dp(42), 1));
        secondary.addView(autoModeButton, new LinearLayout.LayoutParams(0, dp(42), 1));
        hero.addView(secondary);
        page.addView(sectionTitle("播放素材"), topMarginParams(0, dp(20)));

        LinearLayout audioCard = sourceCard(true);
        page.addView(audioCard, topMarginParams(0, dp(8)));
        audioCardTitle = (TextView) audioCard.findViewWithTag("sourceTitle");
        audioCardMeta = (TextView) audioCard.findViewWithTag("sourceMeta");

        LinearLayout subtitleCard = sourceCard(false);
        page.addView(subtitleCard, topMarginParams(0, dp(8)));
        subtitleCardTitle = (TextView) subtitleCard.findViewWithTag("sourceTitle");
        subtitleCardMeta = (TextView) subtitleCard.findViewWithTag("sourceMeta");

        queueCard = column();
        queueCard.setPadding(dp(14), dp(12), dp(14), dp(12));
        queueCard.setBackground(rounded(Color.rgb(255, 244, 216), 20, Color.argb(60, 217, 164, 65), 1));
        queueCard.setVisibility(View.GONE);
        TextView queueTitle = text("中文朗读队列", 14, ESPRESSO, Typeface.BOLD);
        queueCount = text("", 11.5f, MUTED, Typeface.NORMAL);
        LinearLayout queueActions = row();
        Button skip = smallButton("停止当前朗读");
        skip.setOnClickListener(view -> withService(EchoPlaybackService::skipSpeech));
        Button clear = smallButton("清空队列");
        clear.setOnClickListener(view -> withService(EchoPlaybackService::clearSpeechQueue));
        queueActions.addView(skip, new LinearLayout.LayoutParams(0, dp(40), 1));
        LinearLayout.LayoutParams clearParams = new LinearLayout.LayoutParams(0, dp(40), 1);
        clearParams.leftMargin = dp(8);
        queueActions.addView(clear, clearParams);
        queueCard.addView(queueTitle);
        queueCard.addView(queueCount, topMarginParams(0, dp(3)));
        queueCard.addView(queueActions, topMarginParams(0, dp(8)));
        page.addView(queueCard, topMarginParams(0, dp(12)));

        skipSpeechButton = text("跳过本句朗读并继续原声", 12, MUTED, Typeface.BOLD);
        skipSpeechButton.setGravity(Gravity.CENTER);
        skipSpeechButton.setBackground(rounded(CREAM_LIGHT, 18, Color.argb(35, 46, 33, 28), 1));
        skipSpeechButton.setOnClickListener(view -> withService(EchoPlaybackService::skipSpeech));
        skipSpeechButton.setVisibility(View.GONE);
        page.addView(skipSpeechButton, topMarginParams(0, dp(10), ViewGroup.LayoutParams.MATCH_PARENT, dp(46)));
        return page;
    }

    private LinearLayout buildCuePage() {
        LinearLayout page = column();
        page.setPadding(dp(16), dp(10), dp(16), dp(12));

        LinearLayout headerRow = row();
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout heading = column();
        TextView title = text("字幕流", 25, ESPRESSO, Typeface.BOLD);
        title.setTypeface(Typeface.create("serif", Typeface.BOLD));
        TextView hint = text("点击任意一句，跳到该时间点并播放", 11.5f, MUTED, Typeface.NORMAL);
        heading.addView(title);
        heading.addView(hint);
        headerRow.addView(heading, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button choose = smallButton("选择字幕");
        choose.setOnClickListener(view -> pickSubtitle());
        headerRow.addView(choose, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(42)));
        page.addView(headerRow);

        LinearLayout fileCard = column();
        fileCard.setPadding(dp(14), dp(11), dp(14), dp(11));
        fileCard.setBackground(rounded(CREAM_LIGHT, 19, Color.argb(28, 46, 33, 28), 1));
        cueFileTitle = text("未装入字幕", 14, ESPRESSO, Typeface.BOLD);
        cueFileMeta = text("支持 VTT / SRT / ASS / SSA / LRC / TXT", 10.5f, MUTED, Typeface.NORMAL);
        fileCard.addView(cueFileTitle);
        fileCard.addView(cueFileMeta, topMarginParams(0, dp(3)));
        page.addView(fileCard, topMarginParams(0, dp(14)));

        LinearLayout current = column();
        current.setPadding(dp(14), dp(12), dp(14), dp(12));
        current.setBackground(rounded(ESPRESSO, 20, Color.TRANSPARENT, 0));
        cueCurrentTime = text("当前字幕", 9, Color.rgb(199, 164, 107), Typeface.BOLD);
        cueCurrentText = text("等待字幕到达", 15, CREAM_LIGHT, Typeface.BOLD);
        cueCurrentText.setLineSpacing(dp(2), 1f);
        current.addView(cueCurrentTime);
        current.addView(cueCurrentText, topMarginParams(0, dp(5)));
        current.setVisibility(View.GONE);
        page.addView(current, topMarginParams(0, dp(10)));

        cueSearch = new EditText(this);
        cueSearch.setSingleLine(true);
        cueSearch.setHint("搜索字幕文本");
        cueSearch.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        cueSearch.setTextColor(ESPRESSO);
        cueSearch.setHintTextColor(Color.argb(150, 124, 97, 83));
        cueSearch.setPadding(dp(14), 0, dp(14), 0);
        cueSearch.setBackground(rounded(CREAM_LIGHT, 18, Color.argb(32, 46, 33, 28), 1));
        cueSearch.addTextChangedListener(new SimpleTextWatcher(this::rebuildCueRows));
        page.addView(cueSearch, topMarginParams(0, dp(10), ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));

        cueEmpty = text(
            "还没有字幕文件\n支持 VTT、SRT、ASS/SSA、LRC 和 TXT，字幕与音频文件名不需要一致。",
            13,
            MUTED,
            Typeface.NORMAL
        );
        cueEmpty.setGravity(Gravity.CENTER);
        cueEmpty.setLineSpacing(dp(4), 1f);
        cueEmpty.setBackground(rounded(CREAM_LIGHT, 22, Color.argb(35, 46, 33, 28), 1));
        page.addView(cueEmpty, topMarginParams(0, dp(12), ViewGroup.LayoutParams.MATCH_PARENT, dp(150)));

        cueRowsScroll = new ScrollView(this);
        cueRowsScroll.setFillViewport(true);
        cueRowsContainer = column();
        cueRowsScroll.addView(cueRowsContainer);
        page.addView(cueRowsScroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        return page;
    }

    private View buildSettingsPage() {
        LinearLayout page = column();
        page.setPadding(dp(16), dp(10), dp(16), dp(28));
        TextView title = text("播放设置", 25, ESPRESSO, Typeface.BOLD);
        title.setTypeface(Typeface.create("serif", Typeface.BOLD));
        TextView hint = text("修改后立即生效并保存在本机", 11.5f, MUTED, Typeface.NORMAL);
        page.addView(title);
        page.addView(hint, topMarginParams(0, dp(3)));

        page.addView(sectionTitle("跟读模式"), topMarginParams(0, dp(18)));
        LinearLayout switchCard = card();
        switchCard.addView(text("字幕到达时暂停原声", 14, ESPRESSO, Typeface.BOLD));
        switchCard.addView(
            text("开启后朗读结束从暂停位置继续；关闭后原声连续播放", 11, MUTED, Typeface.NORMAL),
            topMarginParams(0, dp(3))
        );
        autoPauseSwitch = new Switch(this);
        autoPauseSwitch.setShowText(false);
        autoPauseSwitch.setButtonTintList(ColorStateList.valueOf(RUST));
        autoPauseSwitch.setThumbTintList(ColorStateList.valueOf(CREAM_LIGHT));
        autoPauseSwitch.setTrackTintList(ColorStateList.valueOf(Color.argb(80, 191, 91, 46)));
        autoPauseSwitch.setOnCheckedChangeListener((button, checked) -> {
            if (!bindingSettings) setAutoPause(checked);
        });
        switchCard.addView(autoPauseSwitch, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48)));
        page.addView(switchCard, topMarginParams(0, dp(8)));

        page.addView(sectionTitle("朗读时机"), topMarginParams(0, dp(18)));
        LinearLayout triggerCard = card();
        triggerCard.addView(text("什么时候朗读字幕", 14, ESPRESSO, Typeface.BOLD));
        triggerCard.addView(
            text("结束时朗读更接近“听完整句后翻译”的体验", 11, MUTED, Typeface.NORMAL),
            topMarginParams(0, dp(3))
        );
        triggerCard.addView(
            text("VTT/SRT/ASS 使用真实结束时间；LRC/TXT 按文字字数估算", 10.5f, MUTED, Typeface.NORMAL),
            topMarginParams(0, dp(3))
        );
        triggerModeGroup = new RadioGroup(this);
        triggerModeGroup.setOrientation(RadioGroup.HORIZONTAL);
        RadioButton atStart = new RadioButton(this);
        atStart.setId(View.generateViewId());
        atStart.setText("字幕开始时");
        atStart.setTextColor(ESPRESSO);
        RadioButton atEnd = new RadioButton(this);
        atEnd.setId(View.generateViewId());
        atEnd.setText("字幕结束时");
        atEnd.setTextColor(ESPRESSO);
        triggerModeGroup.addView(atStart, new RadioGroup.LayoutParams(0, dp(44), 1));
        triggerModeGroup.addView(atEnd, new RadioGroup.LayoutParams(0, dp(44), 1));
        triggerModeGroup.setOnCheckedChangeListener((group, checkedId) -> {
            if (bindingSettings) return;
            triggerMode = checkedId == atEnd.getId() ? "end" : "start";
            sortCuesForTriggerMode();
            rebuildCueRows();
            persistSettings();
            updateSettings();
        });
        triggerCard.addView(triggerModeGroup);
        page.addView(triggerCard, topMarginParams(0, dp(8)));

        page.addView(sectionTitle("屏蔽词"), topMarginParams(0, dp(18)));
        LinearLayout blockedCard = card();
        blockedCard.addView(text("包含屏蔽词的字幕不朗读", 14, ESPRESSO, Typeface.BOLD));
        blockedCard.addView(
            text("模式 A 会保持原声连续播放；模式 B 会跳过该条朗读", 11, MUTED, Typeface.NORMAL),
            topMarginParams(0, dp(3))
        );
        LinearLayout addBlockedWordRow = row();
        addBlockedWordRow.setGravity(Gravity.CENTER_VERTICAL);
        addBlockedWordRow.setPadding(0, dp(8), 0, 0);
        blockedWordInput = new EditText(this);
        blockedWordInput.setSingleLine(true);
        blockedWordInput.setHint("输入屏蔽词或短语");
        blockedWordInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        blockedWordInput.setTextColor(ESPRESSO);
        blockedWordInput.setHintTextColor(Color.argb(150, 124, 97, 83));
        blockedWordInput.setPadding(dp(12), 0, dp(12), 0);
        blockedWordInput.setBackground(
            rounded(Color.rgb(247, 238, 223), 16, Color.argb(30, 46, 33, 28), 1)
        );
        addBlockedWordRow.addView(blockedWordInput, new LinearLayout.LayoutParams(0, dp(44), 1));
        Button addBlockedWord = smallButton("添加");
        addBlockedWord.setOnClickListener(view -> addBlockedWord());
        LinearLayout.LayoutParams addParams = new LinearLayout.LayoutParams(dp(76), dp(44));
        addParams.leftMargin = dp(7);
        addBlockedWordRow.addView(addBlockedWord, addParams);
        blockedCard.addView(addBlockedWordRow);
        blockedWordsContainer = column();
        blockedCard.addView(blockedWordsContainer, topMarginParams(0, dp(9)));
        page.addView(blockedCard, topMarginParams(0, dp(8)));
        renderBlockedWords();

        page.addView(sectionTitle("中文朗读"), topMarginParams(0, dp(18)));
        LinearLayout voiceCard = card();
        ttsStateText = text("系统语音", 13.5f, ESPRESSO, Typeface.BOLD);
        voiceCard.addView(ttsStateText);
        voiceSpinner = new Spinner(this);
        voiceSpinner.setPadding(0, dp(5), 0, dp(5));
        voiceSpinner.setOnItemSelectedListener(
            new android.widget.AdapterView.OnItemSelectedListener() {
                @Override
                public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                    if (bindingSettings || position == 0 || position - 1 >= nativeVoices.length()) return;
                    try {
                        voiceName = nativeVoices.getJSONObject(position - 1).optString("name", "");
                        selectedVoiceIndex = position;
                        prefs.edit().putString("voiceName", voiceName).apply();
                        withService(service -> service.setVoice(voiceName));
                        updateTtsState();
                    } catch (JSONException ignored) {}
                }

                @Override
                public void onNothingSelected(android.widget.AdapterView<?> parent) {}
            }
        );
        voiceCard.addView(voiceSpinner, topMarginParams(0, dp(8), ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));
        Button testVoice = smallButton("试听系统语音");
        testVoice.setOnClickListener(view -> testVoice());
        voiceCard.addView(testVoice, topMarginParams(0, dp(8), ViewGroup.LayoutParams.MATCH_PARENT, dp(42)));
        Button ttsSettings = smallButton("打开系统语音设置");
        ttsSettings.setOnClickListener(view -> openTtsSettings());
        voiceCard.addView(ttsSettings, topMarginParams(0, dp(6), ViewGroup.LayoutParams.MATCH_PARENT, dp(42)));
        page.addView(voiceCard, topMarginParams(0, dp(8)));

        LinearLayout rateCard = card();
        ttsRateValue = addSlider(rateCard, "朗读语速");
        ttsRateBar = (SeekBar) rateCard.getChildAt(rateCard.getChildCount() - 1);
        rateCard.addView(
            text("非 1.0× 时使用应用层变速，兼容忽略系统语速参数的小米语音引擎", 10.5f, MUTED, Typeface.NORMAL),
            topMarginParams(0, dp(3))
        );
        LinearLayout volumeCard = card();
        ttsVolumeValue = addSlider(volumeCard, "朗读音量");
        ttsVolumeBar = (SeekBar) volumeCard.getChildAt(volumeCard.getChildCount() - 1);
        LinearLayout pitchCard = card();
        ttsPitchValue = addSlider(pitchCard, "朗读音高");
        ttsPitchBar = (SeekBar) pitchCard.getChildAt(pitchCard.getChildCount() - 1);
        page.addView(rateCard, topMarginParams(0, dp(8)));
        page.addView(volumeCard, topMarginParams(0, dp(8)));
        page.addView(pitchCard, topMarginParams(0, dp(8)));

        page.addView(sectionTitle("原声与同步"), topMarginParams(0, dp(18)));
        LinearLayout speedCard = card();
        playbackRateValue = addSlider(speedCard, "原声速度");
        playbackRateBar = (SeekBar) speedCard.getChildAt(speedCard.getChildCount() - 1);
        page.addView(speedCard, topMarginParams(0, dp(8)));

        LinearLayout offsetCard = card();
        LinearLayout offsetHeader = row();
        offsetHeader.setGravity(Gravity.CENTER_VERTICAL);
        offsetHeader.addView(text("字幕偏移", 14, ESPRESSO, Typeface.BOLD), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        offsetValue = text("±0.0s", 12, RUST, Typeface.BOLD);
        offsetHeader.addView(offsetValue);
        offsetCard.addView(offsetHeader);
        LinearLayout offsetButtons = row();
        offsetButtons.setPadding(0, dp(8), 0, 0);
        String[] labels = { "−0.5s", "−0.1s", "归零", "+0.1s", "+0.5s" };
        int[] deltas = { -500, -100, 0, 100, 500 };
        for (int i = 0; i < labels.length; i++) {
            final int delta = deltas[i];
            Button button = smallButton(labels[i]);
            button.setOnClickListener(view -> setOffset(delta == 0 ? 0 : offsetMs + delta));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(40), 1);
            params.leftMargin = i == 0 ? 0 : dp(4);
            offsetButtons.addView(button, params);
        }
        offsetCard.addView(offsetButtons);
        page.addView(offsetCard, topMarginParams(0, dp(8)));

        LinearLayout expiredCard = card();
        expiredCard.addView(text("过期字幕策略", 14, ESPRESSO, Typeface.BOLD));
        expiredGroup = new RadioGroup(this);
        expiredGroup.setOrientation(RadioGroup.HORIZONTAL);
        RadioButton readAll = new RadioButton(this);
        readAll.setId(View.generateViewId());
        readAll.setText("逐条补读");
        readAll.setTextColor(ESPRESSO);
        RadioButton skip = new RadioButton(this);
        skip.setId(View.generateViewId());
        skip.setText("跳到进度");
        skip.setTextColor(ESPRESSO);
        expiredGroup.addView(readAll, new RadioGroup.LayoutParams(0, dp(44), 1));
        expiredGroup.addView(skip, new RadioGroup.LayoutParams(0, dp(44), 1));
        expiredGroup.setOnCheckedChangeListener((group, checkedId) -> {
            if (bindingSettings) return;
            expiredPolicy = checkedId == skip.getId() ? "skip" : "read-all";
            persistSettings();
            updateSettings();
        });
        expiredCard.addView(expiredGroup);
        page.addView(expiredCard, topMarginParams(0, dp(8)));

        TextView privacy = text(
            "音频、字幕和系统 TTS 均在本机处理，不上传文件或朗读内容。",
            11,
            MUTED,
            Typeface.NORMAL
        );
        privacy.setPadding(dp(12), dp(10), dp(12), dp(10));
        privacy.setBackground(rounded(Color.argb(20, 46, 33, 28), 16, Color.TRANSPARENT, 0));
        page.addView(privacy, topMarginParams(0, dp(16)));

        bindSlider(ttsRateBar, () -> {
            ttsRate = sliderValue(ttsRateBar, 0.5f, 1.8f, 0.05f);
            ttsRateValue.setText(String.format(Locale.ROOT, "%.2f×", ttsRate));
            persistSettings();
            updateSettings();
        }, () -> withService(EchoPlaybackService::reapplySpeechTuning));
        bindSlider(ttsVolumeBar, () -> {
            ttsVolume = sliderValue(ttsVolumeBar, 0f, 1f, 0.05f);
            ttsVolumeValue.setText(Math.round(ttsVolume * 100) + "%");
            persistSettings();
            updateSettings();
        }, () -> withService(EchoPlaybackService::reapplySpeechTuning));
        bindSlider(ttsPitchBar, () -> {
            ttsPitch = sliderValue(ttsPitchBar, 0.6f, 1.5f, 0.05f);
            ttsPitchValue.setText(String.format(Locale.ROOT, "%.2f", ttsPitch));
            persistSettings();
            updateSettings();
        }, () -> withService(EchoPlaybackService::reapplySpeechTuning));
        bindSlider(playbackRateBar, () -> {
            playbackRate = sliderValue(playbackRateBar, 0.5f, 2f, 0.05f);
            playbackRateValue.setText(String.format(Locale.ROOT, "%.2f×", playbackRate));
            persistSettings();
            updateSettings();
        });

        bindSettingsControls();
        return page;
    }

    private void bindStaticActions() {
        timeline.setOnSeekBarChangeListener(
            new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                    if (!fromUser || durationMs <= 0) return;
                    timelineTouched = true;
                    timeCurrent.setText(formatClock((int) (durationMs * progress / 1000.0 / 1000.0)));
                }

                @Override
                public void onStartTrackingTouch(SeekBar seekBar) {
                    timelineTouched = true;
                }

                @Override
                public void onStopTrackingTouch(SeekBar seekBar) {
                    if (durationMs > 0) {
                        long target = Math.round(durationMs * seekBar.getProgress() / 1000.0);
                        withService(service -> service.seekTo(target));
                    }
                    timelineTouched = false;
                }
            }
        );
    }

    private void connectService() {
        serviceAttempts = 0;
        tryConnectService();
    }

    private void tryConnectService() {
        EchoPlaybackService service = EchoPlaybackService.getInstance();
        if (service != null) {
            applyPlaybackState(service.getState());
            restoreSession(service);
            loadVoices(service);
            return;
        }
        if (++serviceAttempts >= 100) {
            toast("原生播放服务初始化超时");
            return;
        }
        ui.postDelayed(this::tryConnectService, 50);
    }

    private void restoreSession(EchoPlaybackService service) {
        if (sessionRestored) return;
        sessionRestored = true;
        JSONObject session = service.getSessionInfo();
        if (!session.optBoolean("hasSession", false)) {
            refreshSourceCards();
            return;
        }
        audioUri = session.optString("audioUri", "");
        audioName = session.optString("audioName", "上次使用的音频");
        subtitleUri = session.optString("subtitleUri", "");
        subtitleName = session.optString("subtitleName", "");
        subtitleFormat = session.optString("subtitleFormat", "");
        subtitleEncoding = session.optString("subtitleEncoding", "");
        cues.clear();
        JSONArray rawCues = session.optJSONArray("cues");
        if (rawCues != null) {
            for (int i = 0; i < rawCues.length(); i++) {
                try {
                    cues.add(Cue.fromJson(rawCues.getJSONObject(i)));
                } catch (JSONException ignored) {}
            }
        }
        subtitleWarnings.clear();
        JSONArray warnings = session.optJSONArray("subtitleWarnings");
        if (warnings != null) {
            for (int i = 0; i < warnings.length(); i++) {
                String warning = warnings.optString(i, "");
                if (!warning.isEmpty()) subtitleWarnings.add(warning);
            }
        }
        sortCuesForTriggerMode();
        refreshSourceCards();
        rebuildCueRows();
        rememberCurrentAudio();
        rememberCurrentSubtitle();
        renderRecentLibrary();
        toast("已恢复上次播放位置，原声保持暂停");
    }

    private void applyPlaybackState(JSONObject state) {
        transport = state.optString("transport", "idle");
        speech = state.optString("speech", "idle");
        activeCue = state.isNull("activeCue") ? -1 : state.optInt("activeCue", -1);
        lastBlockedCue = state.isNull("lastBlockedCue") ? -1 : state.optInt("lastBlockedCue", -1);
        pointer = state.optInt("pointer", 0);
        pendingSpeech = state.optInt("pendingSpeechCount", 0);
        positionMs = Math.max(0, state.optLong("positionMs", 0));
        durationMs = Math.max(0, state.optLong("durationMs", 0));
        ttsReady = state.optBoolean("ttsReady", false);
        autoPause = state.optBoolean("autoPause", autoPause);
        lastError = state.optString("lastError", "");

        updatePlaybackUi();
        updateTtsState();
        if (!lastError.isEmpty() && !lastError.equals(shownError)) {
            shownError = lastError;
            toast(lastError);
        }
        if (lastError.isEmpty()) shownError = "";
    }

    private void updatePlaybackUi() {
        playTitle.setText(audioName.isEmpty() ? "还没有装入音频" : audioName);
        String phase;
        if ("playing".equals(transport)) phase = "原声播放中";
        else if ("speaking".equals(speech)) phase = "中文朗读中";
        else if ("paused".equals(transport)) phase = "已暂停";
        else if ("ended".equals(transport)) phase = "播放结束";
        else phase = "等待开始";
        playStatus.setText(phase);
        playStatus.setBackground(
            rounded(
                "playing".equals(transport)
                    ? Color.argb(55, 79, 122, 106)
                    : "speaking".equals(speech)
                        ? Color.argb(48, 217, 164, 65)
                        : Color.argb(24, 252, 246, 234),
                20,
                Color.TRANSPARENT,
                0
            )
        );

        boolean speaking = "speaking".equals(speech);
        boolean playing = "playing".equals(transport);
        playButton.setText(playing || (autoPause && speaking) ? "Ⅱ" : "▶");
        autoModeButton.setText(autoPause ? "◷  自动暂停" : "◷  连续播放");

        Cue active = activeCue >= 0 && activeCue < cues.size() ? cues.get(activeCue) : null;
        Cue blocked = lastBlockedCue >= 0 && lastBlockedCue < cues.size() ? cues.get(lastBlockedCue) : null;
        Cue next = pointer >= 0 && pointer < cues.size() ? cues.get(pointer) : null;
        Cue display = active != null ? active : blocked != null && "playing".equals(transport) ? blocked : next;
        if (display == null) {
            currentCueTime.setText("SUBTITLE CUE");
            currentCueText.setText(audioName.isEmpty() ? "先装入外语音频和中文字幕" : "等待播放到下一句字幕…");
        } else if (active == null && blocked != null && "playing".equals(transport)) {
            currentCueTime.setText("屏蔽词命中 · 原声继续播放");
            currentCueText.setText("已跳过朗读：" + blocked.text);
        } else {
            currentCueTime.setText(
                (speaking ? "正在朗读 · " : triggerMode.equals("end") ? "字幕结束 · " : "字幕开始 · ") +
                    formatClock((int) cueTrigger(display))
            );
            currentCueText.setText(display.text);
        }

        timeCurrent.setText(formatClock((int) (positionMs / 1000.0)));
        timeDuration.setText(durationMs > 0 ? formatClock((int) (durationMs / 1000.0)) : "--:--");
        if (!timelineTouched) {
            int progress = durationMs > 0 ? (int) Math.min(1000, positionMs * 1000 / durationMs) : 0;
            timeline.setProgress(progress);
            timeline.setEnabled(durationMs > 0);
        }

        boolean queueVisible = !autoPause && (speaking || pendingSpeech > 0 || "error".equals(speech));
        queueCard.setVisibility(queueVisible ? View.VISIBLE : View.GONE);
        queueCount.setText("原声继续播放，待播 " + pendingSpeech + " 条");
        skipSpeechButton.setVisibility(autoPause && speaking ? View.VISIBLE : View.GONE);

        if (activeCue != lastRenderedCue || pointer != lastRenderedPointer) {
            lastRenderedCue = activeCue;
            lastRenderedPointer = pointer;
            updateCueSelection();
        }
        updateCurrentCueCard();
    }

    private void updateCurrentCueCard() {
        Cue active = activeCue >= 0 && activeCue < cues.size() ? cues.get(activeCue) : null;
        Cue blocked = lastBlockedCue >= 0 && lastBlockedCue < cues.size() ? cues.get(lastBlockedCue) : null;
        Cue next = pointer >= 0 && pointer < cues.size() ? cues.get(pointer) : null;
        Cue display = active != null ? active : blocked != null && "playing".equals(transport) ? blocked : next;
        if (display == null) {
            cueCurrentText.setText("等待字幕到达");
            cueCurrentTime.setText("当前字幕");
            return;
        }
        if (active == null && blocked != null && "playing".equals(transport)) {
            cueCurrentTime.setText("已跳过屏蔽字幕 · 原声继续");
            cueCurrentText.setText(blocked.text);
            return;
        }
        cueCurrentTime.setText(
            (active != null ? "正在处理 · " : triggerMode.equals("end") ? "字幕结束 · " : "字幕开始 · ") +
                formatClock((int) cueTrigger(display))
        );
        cueCurrentText.setText(display.text);
    }

    private void refreshSourceCards() {
        if (audioCardTitle == null) return;
        audioCardTitle.setText(audioName.isEmpty() ? "选择外语音频" : audioName);
        audioCardMeta.setText(
            audioName.isEmpty()
                ? "MP3 / M4A / WAV / OGG / FLAC"
                : (audioSize > 0 ? formatBytes(audioSize) : "已保存的音频文件")
        );
        subtitleCardTitle.setText(subtitleName.isEmpty() ? "选择中文字幕" : subtitleName);
        subtitleCardMeta.setText(
            subtitleName.isEmpty()
                ? "VTT / SRT / ASS / SSA / LRC / TXT"
                : cues.size() + " 条 · " + subtitleFormat.toUpperCase(Locale.ROOT) + " · " + subtitleEncoding
        );
        cueFileTitle.setText(subtitleName.isEmpty() ? "未装入字幕" : subtitleName);
        cueFileMeta.setText(
            subtitleName.isEmpty()
                ? "支持 VTT / SRT / ASS / SSA / LRC / TXT"
                : cues.size() + " 条 · " + subtitleFormat.toUpperCase(Locale.ROOT) + " · " + subtitleEncoding
        );
        cueEmpty.setVisibility(cues.isEmpty() ? View.VISIBLE : View.GONE);
        cueRowsScroll.setVisibility(cues.isEmpty() ? View.GONE : View.VISIBLE);
        cueSearch.setVisibility(cues.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void rebuildCueRows() {
        if (cueRowsContainer == null) return;
        cueRowsContainer.removeAllViews();
        cueRows.clear();
        cueRowsIndexes.clear();
        String query = cueSearch == null ? "" : cueSearch.getText().toString().trim();
        for (int i = 0; i < cues.size(); i++) {
            Cue cue = cues.get(i);
            if (!query.isEmpty() && !cue.text.contains(query)) continue;
            final int index = i;
            TextView row = text(
                formatClock((int) cueTrigger(cue)) + "   " + cue.text,
                13,
                ESPRESSO,
                Typeface.NORMAL
            );
            row.setLineSpacing(dp(2), 1f);
            row.setPadding(dp(12), dp(10), dp(12), dp(10));
            row.setTag(index);
            row.setOnClickListener(view -> jumpToCue((Integer) view.getTag()));
            cueRows.add(row);
            cueRowsIndexes.add(index);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            params.bottomMargin = dp(5);
            cueRowsContainer.addView(row, params);
        }
        updateCueSelection();
    }

    private void updateCueSelection() {
        for (int i = 0; i < cueRows.size(); i++) {
            int index = cueRowsIndexes.get(i);
            TextView row = cueRows.get(i);
            if (index == activeCue) {
                row.setTextColor(CREAM_LIGHT);
                row.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
                row.setBackground(rounded(RUST, 16, Color.TRANSPARENT, 0));
            } else if (index == pointer) {
                row.setTextColor(ESPRESSO);
                row.setBackground(rounded(CREAM_LIGHT, 16, Color.argb(80, 191, 91, 46), 1));
            } else {
                row.setTextColor(index < pointer ? Color.argb(115, 46, 33, 28) : ESPRESSO);
                row.setTypeface(Typeface.DEFAULT, Typeface.NORMAL);
                row.setBackground(rounded(Color.argb(18, 252, 246, 234), 16, Color.TRANSPARENT, 0));
            }
        }
        for (int i = 0; i < cueRowsIndexes.size(); i++) {
            if (cueRowsIndexes.get(i) == (activeCue >= 0 ? activeCue : pointer)) {
                View row = cueRows.get(i);
                cueRowsScroll.post(
                    () -> cueRowsScroll.smoothScrollTo(0, Math.max(0, row.getTop() - cueRowsScroll.getHeight() / 2))
                );
                break;
            }
        }
    }

    private void onPlayButton() {
        if (audioUri.isEmpty()) {
            pickAudio();
            return;
        }
        if ("playing".equals(transport) || (autoPause && "speaking".equals(speech))) {
            withService(EchoPlaybackService::pause);
        } else {
            withService(EchoPlaybackService::play);
        }
    }

    private void replayAudio() {
        if (audioUri.isEmpty()) return;
        withService(service -> {
            service.seekTo(0);
            service.play();
        });
    }

    private void moveCue(int direction) {
        if (cues.isEmpty() || audioUri.isEmpty()) return;
        int index;
        if (direction > 0) {
            index = Math.max(pointer, 0);
            while (index < cues.size() && cueTrigger(cues.get(index)) + offsetMs / 1000.0 <= positionMs / 1000.0 + 0.05) {
                index += 1;
            }
            if (index >= cues.size()) return;
        } else {
            index = Math.min(pointer, cues.size()) - 1;
            if (index < 0) index = 0;
        }
        jumpToCue(index);
    }

    private void jumpToCue(int index) {
        if (index < 0 || index >= cues.size()) return;
        Cue cue = cues.get(index);
        long target = Math.max(0, Math.round((cueTrigger(cue) + offsetMs / 1000.0 - 0.04) * 1000));
        withService(service -> {
            service.seekTo(target);
            service.play();
        });
    }

    private void pickAudio() {
        audioPicker.launch(new String[] { "audio/*" });
    }

    private void pickSubtitle() {
        subtitlePicker.launch(new String[] { "*/*" });
    }

    private void registerDocumentPickers() {
        audioPicker = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(),
            uri -> {
                if (uri != null) handlePickedAudio(uri);
            }
        );
        subtitlePicker = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(),
            uri -> {
                if (uri != null) handlePickedSubtitle(uri);
            }
        );
    }

    private void persistReadPermission(Uri uri) {
        try {
            getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {}
    }

    private void handlePickedAudio(Uri uri) {
        persistReadPermission(uri);
        String[] description = describeUri(uri);
        audioUri = uri.toString();
        audioName = description[0];
        audioSize = Long.parseLong(description[1]);
        refreshSourceCards();
        rememberCurrentAudio();
        renderRecentLibrary();
        loadCurrentSession(0);
    }

    private void handlePickedSubtitle(Uri uri) {
        persistReadPermission(uri);
        setSubtitleLoading(true);
        ioExecutor.execute(() -> {
            try {
                byte[] bytes = readBytes(uri);
                SubtitleParser.DecodedText decoded = SubtitleParser.decode(bytes);
                String[] description = describeUri(uri);
                SubtitleParser.Result parsed = SubtitleParser.parse(decoded.text, description[0]);
                ui.post(() -> {
                    setSubtitleLoading(false);
                    if (parsed.cues.isEmpty()) {
                        toast(
                            "未能从 " +
                                description[0] +
                                " 解析出字幕条目（" +
                                parsed.format +
                                " · " +
                                decoded.encoding +
                                "）"
                        );
                        return;
                    }
                    subtitleUri = uri.toString();
                    subtitleName = description[0];
                    subtitleFormat = parsed.format;
                    subtitleEncoding = decoded.encoding;
                    subtitleWarnings = parsed.warnings;
                    cues.clear();
                    cues.addAll(parsed.cues);
                    sortCuesForTriggerMode();
                    refreshSourceCards();
                    rebuildCueRows();
                    rememberCurrentSubtitle();
                    renderRecentLibrary();
                    loadCurrentSession(Math.max(0, positionMs));
                    toast("已载入 " + cues.size() + " 条字幕");
                });
            } catch (Exception error) {
                String detail = error.getMessage();
                if (detail == null || detail.trim().isEmpty()) detail = error.getClass().getSimpleName();
                String message = detail;
                ui.post(() -> {
                    setSubtitleLoading(false);
                    toast("字幕读取失败：" + message);
                });
            }
        });
    }

    private void loadCurrentSession(long startPositionMs) {
        if (audioUri.isEmpty()) return;
        withService(service -> {
            JSONObject source = new JSONObject();
            try {
                source.put("uri", subtitleUri);
                source.put("name", subtitleName);
                source.put("format", subtitleFormat);
                source.put("encoding", subtitleEncoding);
                source.put("warnings", new JSONArray(subtitleWarnings));
            } catch (JSONException ignored) {}
            service.loadSession(
                Uri.parse(audioUri),
                audioName,
                new ArrayList<>(cues),
                settingsJson(),
                source,
                startPositionMs
            );
            service.setVoice(voiceName);
        });
    }

    private void loadRecentAudio(RecentStore.AudioItem item) {
        if (!canReadUri(item.uri)) {
            toast("最近音频的访问权限已失效，请重新选择文件");
            return;
        }
        audioUri = item.uri;
        audioName = item.name;
        audioSize = item.size;
        refreshSourceCards();
        rememberCurrentAudio();
        renderRecentLibrary();
        loadCurrentSession(0);
        toast("已使用最近播放：" + item.name);
    }

    private void loadRecentSubtitle(RecentStore.SubtitleItem item) {
        subtitleUri = item.uri;
        subtitleName = item.name;
        subtitleFormat = item.format;
        subtitleEncoding = item.encoding;
        subtitleWarnings = new ArrayList<>(item.warnings);
        cues.clear();
        cues.addAll(item.cues);
        sortCuesForTriggerMode();
        refreshSourceCards();
        rebuildCueRows();
        rememberCurrentSubtitle();
        renderRecentLibrary();
        loadCurrentSession(Math.max(0, positionMs));
        toast("已使用最近字幕：" + item.name);
    }

    private boolean canReadUri(String value) {
        if (value == null || value.isEmpty()) return false;
        try (AssetFileDescriptor descriptor = getContentResolver().openAssetFileDescriptor(Uri.parse(value), "r")) {
            return descriptor != null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void rememberCurrentAudio() {
        if (recentLibrary == null || audioUri.isEmpty() || audioName.isEmpty()) return;
        synchronized (recentLibrary) {
            RecentStore.addAudio(
                recentLibrary,
                new RecentStore.AudioItem(audioUri, audioName, audioSize, System.currentTimeMillis())
            );
        }
        persistRecentLibrary();
    }

    private void rememberCurrentSubtitle() {
        if (recentLibrary == null || subtitleName.isEmpty() || cues.isEmpty()) return;
        synchronized (recentLibrary) {
            RecentStore.addSubtitle(
                recentLibrary,
                new RecentStore.SubtitleItem(
                    subtitleUri,
                    subtitleName,
                    subtitleFormat,
                    subtitleEncoding,
                    subtitleWarnings,
                    cues,
                    System.currentTimeMillis()
                )
            );
        }
        persistRecentLibrary();
    }

    private void persistRecentLibrary() {
        if (recentLibrary == null) return;
        final RecentStore.Library snapshot = recentLibrary;
        ioExecutor.execute(() -> {
            synchronized (snapshot) {
                RecentStore.save(this, snapshot);
            }
        });
    }

    private byte[] readBytes(Uri uri) throws Exception {
        try (
            InputStream input = getContentResolver().openInputStream(uri);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            if (input == null) throw new IllegalStateException("无法打开字幕文件");
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_SUBTITLE_BYTES) throw new IllegalStateException("字幕文件超过 20 MB");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private String[] describeUri(Uri uri) {
        String name = uri.getLastPathSegment() == null ? "未命名文件" : uri.getLastPathSegment();
        long size = 0;
        try (
            Cursor cursor = getContentResolver().query(
                uri,
                new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameColumn >= 0) name = cursor.getString(nameColumn);
                if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn);
            }
        } catch (Exception ignored) {}
        return new String[] { name, Long.toString(size) };
    }

    private void setSubtitleLoading(boolean loading) {
        subtitleCardTitle.setText(loading ? "正在解析字幕…" : (subtitleName.isEmpty() ? "选择中文字幕" : subtitleName));
        subtitleCardMeta.setText(
            loading
                ? "读取文件并识别编码"
                : subtitleName.isEmpty() ? "VTT / SRT / ASS / SSA / LRC / TXT" : cues.size() + " 条"
        );
    }

    private void showTab(String tab) {
        playScroll.setVisibility("player".equals(tab) ? View.VISIBLE : View.GONE);
        cuePage.setVisibility("cues".equals(tab) ? View.VISIBLE : View.GONE);
        settingsScroll.setVisibility("settings".equals(tab) ? View.VISIBLE : View.GONE);
        String[] tabs = { "player", "cues", "settings" };
        for (int i = 0; i < navItems.size(); i++) {
            TextView item = navItems.get(i);
            boolean active = tabs[i].equals(tab);
            item.setTextColor(active ? RUST : MUTED);
            item.setBackground(rounded(active ? Color.argb(24, 191, 91, 46) : Color.TRANSPARENT, 15, Color.TRANSPARENT, 0));
        }
        if ("cues".equals(tab)) rebuildCueRows();
        if ("settings".equals(tab)) {
            bindSettingsControls();
            loadVoices(EchoPlaybackService.getInstance());
        }
    }

    private void loadVoices(@Nullable EchoPlaybackService service) {
        if (service == null) return;
        JSONArray voices = service.getVoices();
        if (voices.length() == 0) {
            updateTtsState();
            return;
        }
        nativeVoices = voices;
        List<String> labels = new ArrayList<>();
        labels.add("自动选择（优先中文语音）");
        int selected = 0;
        for (int i = 0; i < voices.length(); i++) {
            JSONObject voice = voices.optJSONObject(i);
            if (voice == null) continue;
            String name = voice.optString("name", "");
            String language = voice.optString("lang", "");
            boolean local = voice.optBoolean("localService", true);
            labels.add(name + (language.isEmpty() ? "" : " · " + language) + (local ? "" : " · 在线"));
            if (!voiceName.isEmpty() && voiceName.equals(name)) selected = i + 1;
        }
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, labels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        bindingSettings = true;
        voiceSpinner.setAdapter(adapter);
        selectedVoiceIndex = selected;
        voiceSpinner.setSelection(selected);
        bindingSettings = false;
        updateTtsState();
    }

    private void updateTtsState() {
        if (ttsStateText == null) return;
        JSONObject selected = selectedVoiceIndex > 0 && selectedVoiceIndex - 1 < nativeVoices.length()
            ? nativeVoices.optJSONObject(selectedVoiceIndex - 1)
            : null;
        String state;
        if (!ttsReady) {
            state = lastError.isEmpty() ? "系统语音正在初始化…" : lastError;
            voiceStatus.setText("语音未就绪");
        } else if (selected != null) {
            state = "系统语音 · " + selected.optString("name", "");
            voiceStatus.setText("中文语音就绪");
        } else {
            state = "系统语音 · 自动选择中文语音";
            voiceStatus.setText("中文语音就绪");
        }
        ttsStateText.setText(state);
    }

    private void openTtsSettings() {
        openingTtsSettings = true;
        Intent settings = new Intent("com.android.settings.TTS_SETTINGS");
        try {
            startActivity(settings);
        } catch (Exception firstError) {
            try {
                startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS));
            } catch (Exception secondError) {
                openingTtsSettings = false;
                toast("无法打开系统设置，请手动进入“语言与输入 → 文字转语音”");
            }
        }
    }

    private void testVoice() {
        withService(service -> {
            if (!service.speakPreview("这是译声机的中文朗读测试。", settingsJson())) {
                toast("语音引擎尚未就绪或正在朗读");
            }
        });
    }

    private void setAutoPause(boolean enabled) {
        autoPause = enabled;
        prefs.edit().putBoolean("autoPause", enabled).apply();
        bindingSettings = true;
        if (autoPauseSwitch != null) autoPauseSwitch.setChecked(enabled);
        bindingSettings = false;
        updateSettings();
        updateModeButtons();
    }

    private void updateModeButtons() {
        if (autoModeButton != null) autoModeButton.setText(autoPause ? "◷  自动暂停" : "◷  连续播放");
    }

    private void setOffset(int value) {
        offsetMs = Math.max(-10000, Math.min(10000, value));
        offsetValue.setText(formatOffset(offsetMs));
        prefs.edit().putInt("offsetMs", offsetMs).apply();
        updateSettings();
    }

    private void updateSettings() {
        withService(service -> service.updateSettings(settingsJson()));
    }

    private JSONObject settingsJson() {
        JSONObject settings = new JSONObject();
        try {
            settings.put("autoPause", autoPause);
            settings.put("offsetMs", offsetMs);
            settings.put("playbackRate", playbackRate);
            settings.put("ttsRate", ttsRate);
            settings.put("ttsPitch", ttsPitch);
            settings.put("ttsVolume", ttsVolume);
            settings.put("expiredPolicy", expiredPolicy);
            settings.put("triggerMode", triggerMode);
            settings.put("blockedWords", new JSONArray(blockedWords));
        } catch (JSONException ignored) {}
        return settings;
    }

    private void loadPreferences() {
        autoPause = prefs.getBoolean("autoPause", true);
        offsetMs = prefs.getInt("offsetMs", 0);
        playbackRate = prefs.getFloat("playbackRate", 1f);
        ttsRate = prefs.getFloat("ttsRate", 1f);
        ttsVolume = prefs.getFloat("ttsVolume", 1f);
        ttsPitch = prefs.getFloat("ttsPitch", 1f);
        expiredPolicy = prefs.getString("expiredPolicy", "read-all");
        triggerMode = "start".equals(prefs.getString("triggerMode", "end")) ? "start" : "end";
        voiceName = prefs.getString("voiceName", "");
        blockedWords.clear();
        String savedWords = prefs.getString("blockedWords", "[]");
        try {
            JSONArray words = new JSONArray(savedWords);
            for (int i = 0; i < words.length(); i++) {
                String word = words.optString(i, "").trim();
                if (!word.isEmpty() && !containsBlockedWord(word)) blockedWords.add(word);
            }
        } catch (JSONException ignored) {}
    }

    private void persistSettings() {
        prefs.edit()
            .putBoolean("autoPause", autoPause)
            .putInt("offsetMs", offsetMs)
            .putFloat("playbackRate", playbackRate)
            .putFloat("ttsRate", ttsRate)
            .putFloat("ttsVolume", ttsVolume)
            .putFloat("ttsPitch", ttsPitch)
            .putString("expiredPolicy", expiredPolicy)
            .putString("triggerMode", triggerMode)
            .putString("voiceName", voiceName)
            .putString("blockedWords", new JSONArray(blockedWords).toString())
            .apply();
    }

    private void bindSettingsControls() {
        if (autoPauseSwitch == null) return;
        bindingSettings = true;
        autoPauseSwitch.setChecked(autoPause);
        setSlider(ttsRateBar, ttsRate, 0.5f, 1.8f, 0.05f);
        setSlider(ttsVolumeBar, ttsVolume, 0f, 1f, 0.05f);
        setSlider(ttsPitchBar, ttsPitch, 0.6f, 1.5f, 0.05f);
        setSlider(playbackRateBar, playbackRate, 0.5f, 2f, 0.05f);
        ttsRateValue.setText(String.format(Locale.ROOT, "%.2f×", ttsRate));
        ttsVolumeValue.setText(Math.round(ttsVolume * 100) + "%");
        ttsPitchValue.setText(String.format(Locale.ROOT, "%.2f", ttsPitch));
        playbackRateValue.setText(String.format(Locale.ROOT, "%.2f×", playbackRate));
        offsetValue.setText(formatOffset(offsetMs));
        if (expiredGroup != null && expiredGroup.getChildCount() == 2) {
            RadioButton first = (RadioButton) expiredGroup.getChildAt(0);
            RadioButton second = (RadioButton) expiredGroup.getChildAt(1);
            (expiredPolicy.equals("skip") ? second : first).setChecked(true);
        }
        if (triggerModeGroup != null && triggerModeGroup.getChildCount() == 2) {
            RadioButton start = (RadioButton) triggerModeGroup.getChildAt(0);
            RadioButton end = (RadioButton) triggerModeGroup.getChildAt(1);
            (triggerMode.equals("end") ? end : start).setChecked(true);
        }
        bindingSettings = false;
        renderBlockedWords();
    }

    private void addBlockedWord() {
        if (blockedWordInput == null) return;
        String word = blockedWordInput.getText().toString().trim();
        if (word.isEmpty()) {
            toast("请输入要屏蔽的词或短语");
            return;
        }
        if (containsBlockedWord(word)) {
            toast("这个屏蔽词已经存在");
            return;
        }
        blockedWords.add(word);
        blockedWordInput.setText("");
        persistSettings();
        renderBlockedWords();
        updateSettings();
        toast("已屏蔽包含“" + word + "”的字幕");
    }

    private void removeBlockedWord(String word) {
        blockedWords.removeIf(value -> value.equalsIgnoreCase(word));
        persistSettings();
        renderBlockedWords();
        updateSettings();
    }

    private boolean containsBlockedWord(String candidate) {
        for (String word : blockedWords) {
            if (word.equalsIgnoreCase(candidate)) return true;
        }
        return false;
    }

    private void renderBlockedWords() {
        if (blockedWordsContainer == null) return;
        blockedWordsContainer.removeAllViews();
        if (blockedWords.isEmpty()) {
            TextView empty = text("尚未添加屏蔽词", 11.5f, MUTED, Typeface.NORMAL);
            empty.setPadding(dp(10), dp(8), dp(10), dp(8));
            blockedWordsContainer.addView(empty);
            return;
        }
        for (String word : new ArrayList<>(blockedWords)) {
            LinearLayout row = row();
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(10), dp(5), dp(5), dp(5));
            row.setBackground(rounded(Color.rgb(247, 238, 223), 14, Color.argb(24, 46, 33, 28), 1));
            row.addView(
                text(word, 12.5f, ESPRESSO, Typeface.BOLD),
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1)
            );
            Button remove = smallButton("移除");
            remove.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
            remove.setOnClickListener(view -> removeBlockedWord(word));
            row.addView(remove, new LinearLayout.LayoutParams(dp(64), dp(34)));
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            rowParams.bottomMargin = dp(5);
            blockedWordsContainer.addView(row, rowParams);
        }
    }

    private void bindSlider(SeekBar bar, Runnable action) {
        bindSlider(bar, action, null);
    }

    private void bindSlider(SeekBar bar, Runnable action, @Nullable Runnable onCommit) {
        bar.setOnSeekBarChangeListener(
            new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                    if (fromUser && !bindingSettings) action.run();
                }

                @Override
                public void onStartTrackingTouch(SeekBar seekBar) {}

                @Override
                public void onStopTrackingTouch(SeekBar seekBar) {
                    if (!bindingSettings && onCommit != null) onCommit.run();
                }
            }
        );
    }

    private TextView addSlider(LinearLayout card, String label) {
        LinearLayout heading = row();
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(
            text(label, 14, ESPRESSO, Typeface.BOLD),
            new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1)
        );
        TextView valueLabel = text("", 11, RUST, Typeface.BOLD);
        heading.addView(valueLabel);
        card.addView(heading);
        SeekBar bar = new SeekBar(this);
        bar.setProgressTintList(ColorStateList.valueOf(RUST));
        bar.setThumbTintList(ColorStateList.valueOf(RUST));
        bar.setPadding(0, dp(4), 0, 0);
        card.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(42)));
        return valueLabel;
    }

    private int sliderToProgress(float value, float min, float step) {
        return Math.round((value - min) / step);
    }

    private float sliderValue(SeekBar bar, float min, float max, float step) {
        float value = min + bar.getProgress() * step;
        return Math.max(min, Math.min(max, Math.round(value / step) * step));
    }

    private void setSlider(SeekBar bar, float value, float min, float max, float step) {
        if (bar == null) return;
        bar.setMax(Math.round((max - min) / step));
        bar.setProgress(sliderToProgress(value, min, step));
    }

    private void withService(ServiceAction action) {
        EchoPlaybackService.ensureStarted(this);
        runServiceAction(action, 0);
    }

    private void runServiceAction(ServiceAction action, int attempt) {
        EchoPlaybackService service = EchoPlaybackService.getInstance();
        if (service != null) {
            action.run(service);
            return;
        }
        if (attempt >= 100) {
            toast("原生播放服务初始化超时");
            return;
        }
        ui.postDelayed(() -> runServiceAction(action, attempt + 1), 50);
    }

    private LinearLayout sourceCard(boolean audio) {
        LinearLayout card = row();
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(14), dp(12), dp(14), dp(12));
        card.setBackground(rounded(CREAM_LIGHT, 20, Color.argb(28, 46, 33, 28), 1));
        TextView icon = text(audio ? "♫" : "▤", 20, audio ? RUST : ESPRESSO, Typeface.BOLD);
        icon.setGravity(Gravity.CENTER);
        icon.setBackground(rounded(Color.argb(22, 191, 91, 46), 18, Color.TRANSPARENT, 0));
        card.addView(icon, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout labels = column();
        labels.setPadding(dp(12), 0, dp(8), 0);
        TextView name = text(audio ? "选择外语音频" : "选择中文字幕", 14.5f, ESPRESSO, Typeface.BOLD);
        name.setTag("sourceTitle");
        TextView meta = text(audio ? "MP3 / M4A / WAV / OGG / FLAC" : "VTT / SRT / ASS / SSA / LRC / TXT", 10.5f, MUTED, Typeface.NORMAL);
        meta.setTag("sourceMeta");
        labels.addView(name);
        labels.addView(meta, topMarginParams(0, dp(3)));
        card.addView(labels, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button pick = smallButton("选择");
        pick.setOnClickListener(view -> {
            if (audio) pickAudio();
            else pickSubtitle();
        });
        card.addView(pick, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)));
        return card;
    }

    private void renderRecentLibrary() {
        if (recentLibraryButton == null || recentLibrary == null) return;
        recentLibraryButton.setText("最近");
    }

    private void showRecentLibraryDialog() {
        if (recentLibrary == null) return;
        final AlertDialog[] dialogHolder = new AlertDialog[1];
        List<RecentStore.AudioItem> audioItems = new ArrayList<>(recentLibrary.audio);
        List<RecentStore.SubtitleItem> subtitleItems = new ArrayList<>(recentLibrary.subtitles);
        LinearLayout content = column();
        content.setPadding(dp(16), dp(6), dp(16), dp(10));
        content.addView(recentDialogTitle("最近播放"));
        if (audioItems.isEmpty()) {
            content.addView(recentDialogEmpty("还没有最近播放"));
        } else {
            for (RecentStore.AudioItem item : audioItems) {
                TextView row = recentDialogRow(item.name, formatBytes(item.size), item.uri.equals(audioUri));
                row.setOnClickListener(
                    view -> {
                        if (!canReadUri(item.uri)) {
                            toast("最近音频的访问权限已失效，请重新选择文件");
                            return;
                        }
                        if (dialogHolder[0] != null) dialogHolder[0].dismiss();
                        loadRecentAudio(item);
                    }
                );
                content.addView(row, recentDialogRowParams());
            }
        }

        content.addView(recentDialogTitle("最近字幕"), topMarginParams(0, dp(14)));
        if (subtitleItems.isEmpty()) {
            content.addView(recentDialogEmpty("还没有最近字幕"));
        } else {
            for (RecentStore.SubtitleItem item : subtitleItems) {
                String meta = item.cues.size() + " 条";
                if (!item.format.isEmpty()) meta += " · " + item.format.toUpperCase(Locale.ROOT);
                TextView row = recentDialogRow(
                    item.name,
                    meta,
                    !subtitleUri.isEmpty() ? item.uri.equals(subtitleUri) : item.name.equals(subtitleName)
                );
                row.setOnClickListener(
                    view -> {
                        if (dialogHolder[0] != null) dialogHolder[0].dismiss();
                        loadRecentSubtitle(item);
                    }
                );
                content.addView(row, recentDialogRowParams());
            }
        }

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("最近使用")
            .setView(scroll)
            .setNegativeButton("关闭", null)
            .create();
        dialogHolder[0] = dialog;
        dialog.show();
    }

    private TextView recentDialogTitle(String value) {
        TextView title = text(value, 13, ESPRESSO, Typeface.BOLD);
        title.setPadding(dp(2), dp(4), dp(2), dp(6));
        return title;
    }

    private TextView recentDialogEmpty(String value) {
        TextView empty = text(value, 12, MUTED, Typeface.NORMAL);
        empty.setPadding(dp(12), dp(10), dp(12), dp(10));
        empty.setBackground(rounded(CREAM_LIGHT, 14, Color.argb(24, 46, 33, 28), 1));
        return empty;
    }

    private TextView recentDialogRow(String title, String meta, boolean selected) {
        TextView row = text(
            title + "\n" + meta,
            12.5f,
            selected ? CREAM_LIGHT : ESPRESSO,
            Typeface.BOLD
        );
        row.setLineSpacing(dp(2), 1f);
        row.setPadding(dp(12), dp(9), dp(12), dp(9));
        row.setBackground(
            rounded(
                selected ? RUST : CREAM_LIGHT,
                15,
                selected ? Color.TRANSPARENT : Color.argb(28, 46, 33, 28),
                selected ? 0 : 1
            )
        );
        return row;
    }

    private LinearLayout.LayoutParams recentDialogRowParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = dp(6);
        return params;
    }

    private LinearLayout card() {
        LinearLayout card = column();
        card.setPadding(dp(14), dp(12), dp(14), dp(12));
        card.setBackground(rounded(CREAM_LIGHT, 20, Color.argb(28, 46, 33, 28), 1));
        return card;
    }

    private TextView sectionTitle(String value) {
        TextView view = text(value, 12, MUTED, Typeface.BOLD);
        view.setLetterSpacing(0.1f);
        view.setPadding(dp(4), dp(4), 0, dp(4));
        return view;
    }

    private TextView roundControl(String value, float size) {
        TextView view = text(value, size, CREAM_LIGHT, Typeface.NORMAL);
        view.setGravity(Gravity.CENTER);
        view.setBackground(rounded(Color.argb(22, 252, 246, 234), 30, Color.TRANSPARENT, 0));
        return view;
    }

    private TextView secondaryButton(String value) {
        TextView view = text(value, 10.5f, Color.argb(170, 252, 246, 234), Typeface.BOLD);
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private Button smallButton(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        button.setTextColor(CREAM_LIGHT);
        button.setAllCaps(false);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(dp(10), 0, dp(10), 0);
        button.setBackgroundTintList(ColorStateList.valueOf(ESPRESSO));
        return button;
    }

    private TextView text(String value, float size, int color, int style) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans-serif", style));
        return view;
    }

    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout row() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        return layout;
    }

    private GradientDrawable rounded(int color, float radiusDp, int strokeColor, int strokeWidthDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeWidthDp > 0) drawable.setStroke(dp(strokeWidthDp), strokeColor);
        return drawable;
    }

    private LinearLayout.LayoutParams topMarginParams(float top) {
        return topMarginParams(0, top);
    }

    private LinearLayout.LayoutParams topMarginParams(float horizontal, float top) {
        return topMarginParams(horizontal, top, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams topMarginParams(float horizontal, float top, int width, int height) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, height);
        params.topMargin = dp(top);
        int side = dp(horizontal);
        params.leftMargin = side;
        params.rightMargin = side;
        return params;
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private double cueTrigger(Cue cue) {
        return "end".equals(triggerMode) ? cue.end : cue.start;
    }

    private void sortCuesForTriggerMode() {
        cues.sort(
            Comparator
                .comparingDouble(this::cueTrigger)
                .thenComparingDouble(cue -> cue.start)
        );
    }

    private static String formatClock(int seconds) {
        int safe = Math.max(0, seconds);
        int hours = safe / 3600;
        int minutes = (safe % 3600) / 60;
        int secs = safe % 60;
        if (hours > 0) return String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, secs);
        return String.format(Locale.ROOT, "%02d:%02d", minutes, secs);
    }

    private static String formatOffset(int value) {
        String sign = value > 0 ? "+" : value < 0 ? "−" : "±";
        int absolute = Math.abs(value);
        return String.format(Locale.ROOT, "%s%d.%d", sign, absolute / 1000, Math.round((absolute % 1000) / 100.0));
    }

    private static String formatBytes(long bytes) {
        if (bytes <= 0) return "本地文件";
        double mb = bytes / 1024.0 / 1024.0;
        if (mb >= 1) return String.format(Locale.ROOT, "%.1f MB", mb);
        return Math.max(1, Math.round(bytes / 1024.0)) + " KB";
    }

    private interface ServiceAction {
        void run(EchoPlaybackService service);
    }

    private static final class SimpleTextWatcher implements android.text.TextWatcher {
        private final Runnable onChange;

        SimpleTextWatcher(Runnable onChange) {
            this.onChange = onChange;
        }

        @Override
        public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

        @Override
        public void onTextChanged(CharSequence s, int start, int before, int count) {}

        @Override
        public void afterTextChanged(android.text.Editable s) {
            onChange.run();
        }
    }
}
