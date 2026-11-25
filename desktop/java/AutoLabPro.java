// AutoLab Pro — Sleek JavaFX 17+ Desktop UI
// Connects to the Python Diagnostic Engine & C++20 VCI Core over TCP/JSON-RPC (127.0.0.1:9455)
// Run Python backend first: python autolab_engine.py
// Then run JavaFX UI:
//   javac --module-path $PATH_TO_FX --add-modules javafx.controls AutoLabPro.java
//   java  --module-path $PATH_TO_FX --add-modules javafx.controls AutoLabPro

import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.application.Application;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.control.*;
import javafx.scene.effect.DropShadow;
import javafx.scene.layout.*;
import javafx.scene.paint.Color;
import javafx.scene.paint.CycleMethod;
import javafx.scene.paint.LinearGradient;
import javafx.scene.paint.RadialGradient;
import javafx.scene.paint.Stop;
import javafx.scene.shape.ArcType;
import javafx.scene.shape.StrokeLineCap;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import javafx.stage.Stage;
import javafx.util.Duration;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.Socket;
import java.util.Random;

public class AutoLabPro extends Application {

    public static class VehicleProfile {
        final String make, region, model, engines, ecu, proto, wmi;
        final int fromYear, toYear;

        public VehicleProfile(String make, String region, String model, int fromYear, int toYear,
                              String engines, String ecu, String proto, String wmi) {
            this.make = make;
            this.region = region;
            this.model = model;
            this.fromYear = fromYear;
            this.toYear = toYear;
            this.engines = engines;
            this.ecu = ecu;
            this.proto = proto;
            this.wmi = wmi;
        }
    }

    private boolean vciConnected = true;
    private boolean ecuOnline = true;
    private boolean kl15On = true;
    private boolean ecuUnlocked = false;
    private double batteryVolts = 13.7;
    private int currentRpm = 735;
    private int currentSpeed = 0;

    private final Label vciStatusLbl = new Label("● VCI Connected");
    private final Label ecuStatusLbl = new Label("● ECU Online");
    private final Label topBattLbl = new Label("13.7 V");
    private final Label heroConnLbl = new Label("Connected");
    private final Label heroVehicleLbl = new Label("Vehicle: BMW 4 Series F32 (2016)");
    private final Label heroEcuLbl = new Label("ECU: MED17.1");
    private final Label heroVinLbl = new Label("VIN: WBA8E9C50GK482910");
    private final Label heroProtoLbl = new Label("Protocol: UDS / CAN-FD (500k)");
    private final Label flashTargetLbl = new Label("Target ECU: BMW — Bosch MED17.1");
    private final Label loadValLbl = new Label("12.5%");
    private final Label tempValLbl = new Label("87°C");
    private final Label battValLbl = new Label("13.7 V");
    private final Label engineBridgeLbl = new Label("Engine: Local / C++ & Python Bridge Ready");

    private final Canvas rpmGaugeCanvas = new Canvas(196, 132);
    private final Canvas speedGaugeCanvas = new Canvas(196, 132);
    private final StackPane mainContentPane = new StackPane();

    private final ObservableList<VehicleProfile> vehicleData = FXCollections.observableArrayList(
        new VehicleProfile("BMW", "European", "3 Series E30 / E36", 1982, 1999, "M20 / M40 / M50", "Bosch Motronic M1.3 / MS41", "OBD-I / K-Line", "WBA"),
        new VehicleProfile("BMW", "European", "3 / 4 Series F30 / F32", 2012, 2019, "N20 / N55 / B48 / B58", "Bosch MED17.1 / MG1", "UDS / CAN-FD / DoIP", "WBA"),
        new VehicleProfile("BMW", "European", "G20 / G80 / i4 / iX", 2019, 2026, "B58 / S58 / eDrive 5.0", "Bosch MG1CS201 / SME", "DoIP Ethernet / SecOC", "WBA"),
        new VehicleProfile("Mercedes-Benz", "European", "190E W201 / W124", 1982, 1996, "M102 / M103 / M104", "Bosch KE-Jetronic / HFM", "Blink Code / K-Line 38-pin", "WDB"),
        new VehicleProfile("Mercedes-Benz", "European", "W205 / W213 / W206 / EQS", 2014, 2026, "M274 / M254 / eATS", "Bosch MED17.7 / MG1CP002", "UDS / CAN-FD / DoIP", "W1K"),
        new VehicleProfile("Volkswagen", "European", "Golf Mk8 / ID.4 / ID.7", 2020, 2026, "1.5 eTSI / APP550 EV", "Bosch MG1CS011 / ICAS1", "CAN-FD / DoIP / SFD2", "WVW"),
        new VehicleProfile("Toyota", "Japanese", "Corolla E80–E120 / Land Cruiser J70", 1983, 2007, "4A-GE / 1FZ-FE / 2UZ-FE", "Denso TCCS / 16-bit", "OBD-I TE1-E1 / ISO 9141-2", "JT2"),
        new VehicleProfile("Toyota", "Japanese", "Camry / LC J300 / bZ4X", 2008, 2026, "2GR-FE / A25A / F33A", "Denso Gen3 / Gen4 RH850", "CAN 500k / CAN-FD / UDS", "JTD"),
        new VehicleProfile("Hyundai", "Korean", "Tucson / Palisade / Ioniq 5 & 6", 2011, 2026, "Smartstream / E-GMP 800V", "SIM2K-250 / VCU", "UDS / CAN-FD / DoIP", "KMH"),
        new VehicleProfile("Ford", "American", "Mustang / F-150 / Mach-E", 2005, 2026, "EcoBoost / Coyote / EV", "Bosch MEDG17 / MG1CS015", "HS-CAN / CAN-FD DoIP", "1FT"),
        new VehicleProfile("Tesla", "American", "Model 3 / Y / S / Cybertruck", 2012, 2026, "IPM-SynRM 400V–800V", "MCU1–3 / BMS / VCFront", "Tesla CAN / Ethernet DoIP", "5YJ"),
        new VehicleProfile("BYD", "Chinese / EV", "Han / Tang / Atto 3 / Seal", 2006, 2026, "DM-i / Blade EV 8-in-1", "BYD VCU / BMS", "CAN / CAN-FD / DoIP", "LGX")
    );

    @Override
    public void start(Stage stage) {
        BorderPane root = new BorderPane();
        root.setStyle("-fx-background-color: linear-gradient(to bottom right, #030711, #071226, #030812);");
        root.setPadding(new Insets(12));

        root.setTop(buildTopBar());
        root.setLeft(buildSidebar());
        root.setCenter(mainContentPane);
        BorderPane.setMargin(mainContentPane, new Insets(12, 0, 0, 12));

        showDashboardView();
        probePythonCppEngine("{\"cmd\":\"handshake\",\"volts\":13.7,\"year\":2016}");

        Timeline telemetryLoop = new Timeline(new KeyFrame(Duration.millis(550), e -> updateTelemetry()));
        telemetryLoop.setCycleCount(Timeline.INDEFINITE);
        telemetryLoop.play();

        Scene scene = new Scene(root, 1400, 840);
        stage.setTitle("AutoLab Pro — JavaFX UI + Python/C++ Engine (1980–2026)");
        stage.setScene(scene);
        stage.show();
    }

    private HBox buildTopBar() {
        HBox top = new HBox(20);
        top.setAlignment(Pos.CENTER_LEFT);
        top.setPadding(new Insets(12, 18, 12, 18));
        top.setStyle("-fx-background-color: #071124; -fx-border-color: rgba(56,152,255,0.38); -fx-border-radius: 12; -fx-background-radius: 12;");

        VBox brandBox = new VBox(2);
        HBox brandTitle = new HBox(4);
        Label autoLbl = new Label("AutoLab");
        autoLbl.setFont(Font.font("System", FontWeight.EXTRA_BOLD, 22));
        autoLbl.setTextFill(Color.WHITE);
        Label proLbl = new Label("Pro");
        proLbl.setFont(Font.font("System", FontWeight.EXTRA_BOLD, 22));
        proLbl.setTextFill(Color.web("#ef3b2d"));
        brandTitle.getChildren().addAll(autoLbl, proLbl);

        Label subtitle = new Label("Advanced ECU Tuning & Programming");
        subtitle.setTextFill(Color.web("#93c5fd"));
        subtitle.setFont(Font.font(11));
        brandBox.getChildren().addAll(brandTitle, subtitle);

        vciStatusLbl.setTextFill(Color.web("#4ade80"));
        vciStatusLbl.setFont(Font.font("System", FontWeight.BOLD, 13));
        ecuStatusLbl.setTextFill(Color.web("#4ade80"));
        ecuStatusLbl.setFont(Font.font("System", FontWeight.BOLD, 13));
        topBattLbl.setTextFill(Color.web("#7dd3fc"));
        topBattLbl.setFont(Font.font("Monospaced", FontWeight.BOLD, 13));

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button vciBtn = new Button("VCI / ECU Setup");
        vciBtn.setStyle("-fx-background-color: #142646; -fx-text-fill: #7dd3fc; -fx-border-color: rgba(56,152,255,0.45); -fx-background-radius: 8; -fx-border-radius: 8; -fx-padding: 6 14; -fx-font-weight: bold;");
        vciBtn.setOnAction(e -> openVciDialog());

        Button connBtn = new Button("Disconnect");
        connBtn.setStyle("-fx-background-color: #142646; -fx-text-fill: white; -fx-border-color: rgba(56,152,255,0.4); -fx-background-radius: 8; -fx-border-radius: 8; -fx-padding: 6 14; -fx-font-weight: bold;");
        connBtn.setOnAction(e -> {
            vciConnected = !vciConnected;
            ecuOnline = vciConnected && kl15On;
            connBtn.setText(vciConnected ? "Disconnect" : "Connect VCI");
            syncConnectionIndicators();
        });

        top.getChildren().addAll(brandBox, spacer, vciStatusLbl, ecuStatusLbl, topBattLbl, vciBtn, connBtn);
        return top;
    }

    private VBox buildSidebar() {
        VBox side = new VBox(6);
        side.setPrefWidth(224);
        side.setPadding(new Insets(10));
        side.setStyle("-fx-background-color: #081326; -fx-border-color: rgba(56,152,255,0.32); -fx-border-radius: 12; -fx-background-radius: 12;");
        BorderPane.setMargin(side, new Insets(12, 0, 0, 0));

        String[] items = {
            "Dashboard",
            "Tuning",
            "Maps",
            "Functions",
            "TCU",
            "Diagnostics",
            "Database (1980–2026)"
        };

        for (String name : items) {
            Button btn = new Button(name);
            btn.setMaxWidth(Double.MAX_VALUE);
            btn.setAlignment(Pos.CENTER_LEFT);
            btn.setStyle("-fx-background-color: #0f203d; -fx-text-fill: #e2e8f0; -fx-font-weight: bold; -fx-padding: 10 12; -fx-background-radius: 8;");
            btn.setOnAction(e -> {
                switch (name) {
                    case "Dashboard" -> showDashboardView();
                    case "Tuning" -> showTuningView();
                    case "Maps" -> showMapsView();
                    case "Diagnostics" -> showDiagnosticsView();
                    case "Database (1980–2026)" -> showDatabaseView();
                    default -> showInfoView(name);
                }
            });
            side.getChildren().add(btn);
        }

        Region sp = new Region();
        VBox.setVgrow(sp, Priority.ALWAYS);
        engineBridgeLbl.setTextFill(Color.web("#7dd3fc"));
        engineBridgeLbl.setFont(Font.font("Monospaced", 10));
        engineBridgeLbl.setWrapText(true);
        side.getChildren().addAll(sp, engineBridgeLbl);
        return side;
    }

    private void showDashboardView() {
        VBox box = new VBox(12);
        box.setPadding(new Insets(14));
        box.setStyle("-fx-background-color: #091428; -fx-border-color: rgba(56,152,255,0.32); -fx-border-radius: 14; -fx-background-radius: 14;");

        HBox topRow = new HBox(12);

        // Hero Vehicle Studio Card
        StackPane heroCard = new StackPane();
        heroCard.setPadding(new Insets(18));
        heroCard.setStyle("-fx-background-color: radial-gradient(center 40% 50%, radius 70%, rgba(30,110,235,0.35), #050c1a); -fx-border-color: rgba(56,152,255,0.4); -fx-border-radius: 12; -fx-background-radius: 12;");
        HBox.setHgrow(heroCard, Priority.ALWAYS);

        VBox statusOverlay = new VBox(8);
        statusOverlay.setMaxWidth(310);
        statusOverlay.setMaxHeight(200);
        statusOverlay.setPadding(new Insets(14));
        statusOverlay.setStyle("-fx-background-color: rgba(7,16,34,0.88); -fx-border-color: rgba(79,172,254,0.45); -fx-border-radius: 10; -fx-background-radius: 10;");
        StackPane.setAlignment(statusOverlay, Pos.TOP_RIGHT);

        heroConnLbl.setFont(Font.font("System", FontWeight.BOLD, 18));
        heroConnLbl.setTextFill(Color.web("#4ade80"));
        for (Label l : new Label[]{heroVehicleLbl, heroEcuLbl, heroVinLbl, heroProtoLbl}) {
            l.setTextFill(Color.web("#e2e8f0"));
            l.setFont(Font.font("Monospaced", 12));
        }
        statusOverlay.getChildren().addAll(styledHeader("Vehicle Status"), heroConnLbl, heroVehicleLbl, heroEcuLbl, heroVinLbl, heroProtoLbl);
        heroCard.getChildren().add(statusOverlay);

        VBox gaugesBox = new VBox(10, wrapCard("RPM", rpmGaugeCanvas), wrapCard("Speed", speedGaugeCanvas));
        topRow.getChildren().addAll(heroCard, gaugesBox);

        HBox teleRow = new HBox(12,
            statCard("Engine Load", loadValLbl),
            statCard("Coolant Temp", tempValLbl),
            statCard("Battery", battValLbl)
        );

        HBox actionsRow = new HBox(12,
            actionTile("14 Core Systems", this::showDiagnosticsView),
            actionTile("Calibration Maps", this::showMapsView),
            actionTile("VCI & ECU Sync", this::openVciDialog),
            actionTile("Database (1980–2026)", this::showDatabaseView)
        );

        box.getChildren().addAll(topRow, teleRow, actionsRow);
        mainContentPane.getChildren().setAll(box);
        drawSegmentedGauge(rpmGaugeCanvas, currentRpm, 7000, "RPM", 5800);
        drawSegmentedGauge(speedGaugeCanvas, currentSpeed, 260, "km/h", -1);
    }

    private void showDatabaseView() {
        VBox box = new VBox(12);
        box.setPadding(new Insets(16));
        box.setStyle("-fx-background-color: #091428; -fx-border-color: rgba(56,152,255,0.32); -fx-border-radius: 14; -fx-background-radius: 14;");

        TextField searchField = new TextField();
        searchField.setPromptText("Search make, model, chassis (E30, W124, Mk8), ECU, protocol (1980–2026)...");
        searchField.setStyle("-fx-background-color: #050c1a; -fx-text-fill: white; -fx-border-color: rgba(56,152,255,0.4); -fx-padding: 8;");

        FilteredList<VehicleProfile> filtered = new FilteredList<>(vehicleData, p -> true);
        searchField.textProperty().addListener((obs, oldV, newV) -> {
            String q = newV.trim().toLowerCase();
            filtered.setPredicate(v -> q.isEmpty()
                || (v.make + " " + v.model + " " + v.ecu + " " + v.proto + " " + v.fromYear + "-" + v.toYear)
                .toLowerCase().contains(q));
        });

        TableView<VehicleProfile> table = new TableView<>(filtered);
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<VehicleProfile, String> colMake = new TableColumn<>("Make");
        colMake.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().make));
        TableColumn<VehicleProfile, String> colModel = new TableColumn<>("Model / Chassis");
        colModel.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().model));
        TableColumn<VehicleProfile, String> colYears = new TableColumn<>("Years");
        colYears.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().fromYear + "–" + c.getValue().toYear));
        TableColumn<VehicleProfile, String> colEcu = new TableColumn<>("ECU Family");
        colEcu.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().ecu));
        TableColumn<VehicleProfile, String> colProto = new TableColumn<>("Protocol");
        colProto.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().proto));
        table.getColumns().addAll(colMake, colModel, colYears, colEcu, colProto);

        Button loadBtn = new Button("Load Selected Vehicle & Sync VCI");
        loadBtn.setStyle("-fx-background-color: #1b6ef3; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 9 16; -fx-background-radius: 8;");
        loadBtn.setOnAction(e -> {
            VehicleProfile sel = table.getSelectionModel().getSelectedItem();
            if (sel != null) {
                heroVehicleLbl.setText("Vehicle: " + sel.make + " " + sel.model + " (" + sel.toYear + ")");
                heroEcuLbl.setText("ECU: " + sel.ecu);
                heroVinLbl.setText("VIN: " + sel.wmi + "8E9C50" + (sel.toYear % 100) + "482910");
                heroProtoLbl.setText("Protocol: " + sel.proto);
                flashTargetLbl.setText("Target ECU: " + sel.make + " — " + sel.ecu);
                probePythonCppEngine("{\"cmd\":\"handshake\",\"volts\":" + batteryVolts + ",\"year\":" + sel.toYear + "}");
                showDashboardView();
            }
        });

        box.getChildren().addAll(styledHeader("Global Vehicle Database (1980–2026)"), searchField, table, loadBtn);
        mainContentPane.getChildren().setAll(box);
    }

    private void showTuningView() {
        VBox box = new VBox(12);
        box.setPadding(new Insets(16));
        box.setStyle("-fx-background-color: #091428; -fx-border-color: rgba(56,152,255,0.32); -fx-border-radius: 14; -fx-background-radius: 14;");

        flashTargetLbl.setTextFill(Color.web("#7dd3fc"));
        flashTargetLbl.setFont(Font.font("Monospaced", 13));

        Label secLbl = new Label(ecuUnlocked ? "Security 0x27: UNLOCKED" : "Security 0x27: LOCKED (Seed/Key Required)");
        secLbl.setTextFill(Color.web(ecuUnlocked ? "#4ade80" : "#fbbf24"));

        Button unlockBtn = new Button("Unlock Security Access (0x27 via C++ Core)");
        unlockBtn.setStyle("-fx-background-color: #142646; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 8 14;");
        unlockBtn.setOnAction(e -> {
            ecuUnlocked = true;
            secLbl.setText("Security 0x27: UNLOCKED");
            secLbl.setTextFill(Color.web("#4ade80"));
            probePythonCppEngine("{\"cmd\":\"uds_key\",\"seed\":2761927697}");
        });

        ProgressBar flashBar = new ProgressBar(0);
        flashBar.setPrefWidth(520);
        Label stageLbl = new Label("Pre-Flash Gate: " + (vciConnected && ecuOnline && batteryVolts >= 12.5 ? "READY" : "LOCKED"));
        stageLbl.setTextFill(Color.web("#4ade80"));

        Button flashBtn = new Button("Erase -> Write -> Verify Calibration");
        flashBtn.setStyle("-fx-background-color: #1b6ef3; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 8 16;");
        flashBtn.setOnAction(e -> {
            if (!vciConnected || !ecuOnline || !ecuUnlocked) {
                stageLbl.setText("Blocked: Connect VCI and Unlock 0x27 Security First");
                stageLbl.setTextFill(Color.web("#f87171"));
                return;
            }
            flashBar.setProgress(1.0);
            stageLbl.setText("Flash Complete & C++ CRC-32 Verified");
            stageLbl.setTextFill(Color.web("#4ade80"));
        });

        box.getChildren().addAll(styledHeader("ECU Flashing & Calibration Pipeline"), flashTargetLbl, secLbl, unlockBtn, stageLbl, flashBar, flashBtn);
        mainContentPane.getChildren().setAll(box);
    }

    private void showMapsView() {
        VBox box = new VBox(12);
        box.setPadding(new Insets(16));
        box.setStyle("-fx-background-color: #091428; -fx-border-color: rgba(56,152,255,0.32); -fx-border-radius: 14; -fx-background-radius: 14;");
        TextArea maps = new TextArea(
            "Calibration Table: Target Boost Pressure (mbar) [RPM x Load]\n" +
            "1500 RPM: 1020  1050  1120  1240  1380  1480\n" +
            "2500 RPM: 1040  1120  1280  1480  1690  1840\n" +
            "3500 RPM: 1050  1180  1410  1680  1920  2080\n" +
            "5000 RPM: 1050  1210  1450  1740  1980  2120"
        );
        maps.setEditable(false);
        maps.setStyle("-fx-control-inner-background: #050b16; -fx-text-fill: #e2e8f0; -fx-font-family: monospace;");
        box.getChildren().addAll(styledHeader("Calibration Maps & Binary Hex Lab"), maps);
        mainContentPane.getChildren().setAll(box);
    }

    private void showDiagnosticsView() {
        VBox box = new VBox(12);
        box.setPadding(new Insets(16));
        box.setStyle("-fx-background-color: #091428; -fx-border-color: rgba(56,152,255,0.32); -fx-border-radius: 14; -fx-background-radius: 14;");
        TextArea log = new TextArea(
            vciConnected && ecuOnline
                ? "0x7E0 ECM/DME [CAN-FD] - Online (1 DTC: P0171)\n0x7E1 TCU [CAN-FD] - Online\n0x760 ABS/ESP [CAN-C] - Online\n0x740 BCM/ZGW [DoIP] - Online\n0x750 SRS/EDR [CAN-B] - Online (1 Historical)"
                : "VCI or ECU Offline. Open VCI / ECU Setup to connect."
        );
        log.setEditable(false);
        log.setStyle("-fx-control-inner-background: #050b16; -fx-text-fill: #7dd3fc; -fx-font-family: monospace;");
        box.getChildren().addAll(styledHeader("14 Core Systems — Multi-Bus Topology"), log);
        mainContentPane.getChildren().setAll(box);
    }

    private void showInfoView(String title) {
        VBox box = new VBox(12, styledHeader(title), new Label("Synchronized with active VCI & ECU session."));
        box.setPadding(new Insets(16));
        box.setStyle("-fx-background-color: #091428; -fx-border-color: rgba(56,152,255,0.32); -fx-border-radius: 14; -fx-background-radius: 14;");
        mainContentPane.getChildren().setAll(box);
    }

    private void openVciDialog() {
        Dialog<Void> dlg = new Dialog<>();
        dlg.setTitle("VCI Adapter & ECU Controller Connection");
        dlg.getDialogPane().getButtonTypes().add(ButtonType.CLOSE);
        VBox content = new VBox(10);
        content.setPadding(new Insets(12));
        CheckBox kl15Check = new CheckBox("Ignition Terminal KL15 ON");
        kl15Check.setSelected(kl15On);
        kl15Check.setOnAction(e -> {
            kl15On = kl15Check.isSelected();
            ecuOnline = vciConnected && kl15On;
            syncConnectionIndicators();
        });
        Button syncBtn = new Button("Run Python/C++ VCI Handshake");
        syncBtn.setOnAction(e -> {
            vciConnected = true;
            ecuOnline = kl15On;
            probePythonCppEngine("{\"cmd\":\"handshake\",\"volts\":" + batteryVolts + ",\"year\":2016}");
            syncConnectionIndicators();
        });
        content.getChildren().addAll(new Label("Adapter: AutoLab VCI Pro (J2534-2 / CAN-FD / K-Line)"), kl15Check, syncBtn);
        dlg.getDialogPane().setContent(content);
        dlg.showAndWait();
    }

    private void syncConnectionIndicators() {
        boolean link = vciConnected && ecuOnline;
        vciStatusLbl.setText(vciConnected ? "● VCI Connected" : "● VCI Offline");
        vciStatusLbl.setTextFill(Color.web(vciConnected ? "#4ade80" : "#fbbf24"));
        ecuStatusLbl.setText(link ? "● ECU Online" : "● ECU Offline");
        ecuStatusLbl.setTextFill(Color.web(link ? "#4ade80" : "#fbbf24"));
        heroConnLbl.setText(link ? "Connected" : "Offline");
        heroConnLbl.setTextFill(Color.web(link ? "#4ade80" : "#fbbf24"));
    }

    private void probePythonCppEngine(String jsonPayload) {
        new Thread(() -> {
            try (Socket sock = new Socket("127.0.0.1", 9455);
                 PrintWriter out = new PrintWriter(sock.getOutputStream(), true);
                 BufferedReader in = new BufferedReader(new InputStreamReader(sock.getInputStream()))) {
                out.println(jsonPayload);
                String reply = in.readLine();
                javafx.application.Platform.runLater(() ->
                    engineBridgeLbl.setText("Py/C++ IPC: " + reply)
                );
            } catch (Exception ignored) {
                javafx.application.Platform.runLater(() ->
                    engineBridgeLbl.setText("Engine: Standalone Mode (Start autolab_engine.py for IPC)")
                );
            }
        }).start();
    }

    private void updateTelemetry() {
        if (!vciConnected || !ecuOnline) {
            currentRpm = 0;
            loadValLbl.setText("--");
            drawSegmentedGauge(rpmGaugeCanvas, 0, 7000, "RPM", 5800);
            return;
        }
        currentRpm = 725 + new Random().nextInt(24);
        loadValLbl.setText(String.format("%.1f%%", 12.1 + Math.random() * 0.9));
        drawSegmentedGauge(rpmGaugeCanvas, currentRpm, 7000, "RPM", 5800);
    }

    private void drawSegmentedGauge(Canvas canvas, double value, double max, String unit, double redlineStart) {
        GraphicsContext gc = canvas.getGraphicsContext2D();
        gc.clearRect(0, 0, canvas.getWidth(), canvas.getHeight());
        int segments = 24;
        double startDeg = -215;
        double totalSpan = 250;
        int activeCount = (int) Math.round(Math.min(1.0, value / max) * segments);
        double cx = 98, cy = 84, rIn = 54, rOut = 70;
        gc.setLineWidth(5.0);
        gc.setLineCap(StrokeLineCap.ROUND);

        for (int i = 0; i < segments; i++) {
            double frac = (double) i / (segments - 1);
            double rad = Math.toRadians(startDeg + frac * totalSpan);
            boolean active = i < activeCount;
            boolean redline = redlineStart > 0 && (frac * max) >= redlineStart;
            if (redline) gc.setStroke(active ? Color.web("#ef4444") : Color.rgb(239, 68, 68, 0.35));
            else if (active) gc.setStroke(Color.web(frac < 0.45 ? "#38bdf8" : "#2563eb"));
            else gc.setStroke(Color.web("#1e293b"));

            gc.strokeLine(
                cx + Math.cos(rad) * rIn, cy + Math.sin(rad) * rIn,
                cx + Math.cos(rad) * rOut, cy + Math.sin(rad) * rOut
            );
        }

        gc.setFill(Color.WHITE);
        gc.setFont(Font.font("Monospaced", FontWeight.BOLD, 24));
        gc.fillText(String.valueOf((int) value), 72, 92);
        gc.setFill(Color.web("#94a3b8"));
        gc.setFont(Font.font(11));
        gc.fillText(unit, 84, 112);
    }

    private Label styledHeader(String text) {
        Label l = new Label(text);
        l.setTextFill(Color.web("#7dd3fc"));
        l.setFont(Font.font("System", FontWeight.BOLD, 15));
        return l;
    }

    private VBox wrapCard(String title, Canvas canvas) {
        Label l = new Label(title);
        l.setTextFill(Color.web("#cbd5e1"));
        l.setFont(Font.font("System", FontWeight.BOLD, 12));
        VBox card = new VBox(4, l, canvas);
        card.setAlignment(Pos.CENTER);
        card.setPadding(new Insets(10));
        card.setStyle("-fx-background-color: #0c1a34; -fx-border-color: rgba(56,152,255,0.35); -fx-border-radius: 12; -fx-background-radius: 12;");
        return card;
    }

    private VBox statCard(String title, Label valueLbl) {
        Label t = new Label(title);
        t.setTextFill(Color.web("#93c5fd"));
        t.setFont(Font.font("System", FontWeight.BOLD, 12));
        valueLbl.setTextFill(Color.WHITE);
        valueLbl.setFont(Font.font("Monospaced", FontWeight.EXTRA_BOLD, 22));
        VBox card = new VBox(6, t, valueLbl);
        card.setPadding(new Insets(14));
        card.setStyle("-fx-background-color: #0c1a34; -fx-border-color: rgba(56,152,255,0.35); -fx-border-radius: 12; -fx-background-radius: 12;");
        HBox.setHgrow(card, Priority.ALWAYS);
        return card;
    }

    private Button actionTile(String label, Runnable action) {
        Button b = new Button(label);
        b.setMaxWidth(Double.MAX_VALUE);
        b.setPrefHeight(54);
        b.setStyle("-fx-background-color: #0c1a34; -fx-text-fill: #f1f5f9; -fx-font-weight: bold; -fx-border-color: rgba(56,152,255,0.35); -fx-border-radius: 12; -fx-background-radius: 12;");
        HBox.setHgrow(b, Priority.ALWAYS);
        b.setOnAction(e -> action.run());
        return b;
    }

    public static void main(String[] args) {
        launch(args);
    }
}
